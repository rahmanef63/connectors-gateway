/**
 * Durable replay guard for the local agent.
 *
 * A signed job remains valid for up to five minutes. Remembering its id only in
 * RAM means an agent restart could execute the same envelope twice. SQLite gives
 * this store an atomic UNIQUE insert and OS-backed locking across local agent
 * processes; a crash releases the lock automatically, unlike a sentinel file.
 *
 * The database contains no credential, but it is still security state. It lives
 * in the private agent directory, is owner-only on POSIX, has a hard page limit,
 * validates its schema/integrity at startup, and fails closed on corruption or a
 * lock timeout. Errors never expose a real path, SQL text, or file contents.
 */
import {
  chmodSync,
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  openSync,
} from "node:fs"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { GatewayError, type ReplayGuard } from "@cg/core"
import {
  MAX_REPLAY_ENTRIES,
  MAX_REPLAY_JOB_ID_LENGTH,
} from "@cg/protocol"
import {
  DIR_MODE,
  FILE_MODE,
  assertPrivateMode,
  supportsPosixModes,
} from "./file-mode"

export const REPLAY_FILE_NAME = "replay-cache.sqlite"

const SCHEMA_VERSION = 1
const DEFAULT_BUSY_TIMEOUT_MS = 2_000
const MAX_BUSY_TIMEOUT_MS = 30_000
const PAGE_SIZE_BYTES = 4_096
const MAX_DATABASE_BYTES = 64 * 1024 * 1024
const MAX_PAGE_COUNT = MAX_DATABASE_BYTES / PAGE_SIZE_BYTES
const REPLAY_CACHE = "replay cache"

type CacheIdentity = { readonly device: number; readonly inode: number }

type CountRow = { count: number }
type IntegrityRow = { quick_check: string }
type VersionRow = { user_version: number }
type TableInfoRow = {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: unknown
  pk: number
}

export type PersistentReplayGuard = ReplayGuard & {
  /** Agent processes keep this open for their lifetime; tests and tools may close it. */
  close(): void
}

export type PersistentReplayGuardOptions = {
  directory: string
  maxEntries?: number
  /** Injectable wall clock for TTL tests. */
  now?: () => number
  /** SQLite waits this long for another local writer before failing closed. */
  busyTimeoutMs?: number
}

/**
 * Open and validate the durable cache before the relay session starts.
 * A malformed, replaced, or permissive existing file prevents startup.
 */
export async function createPersistentReplayGuard(
  options: PersistentReplayGuardOptions,
): Promise<PersistentReplayGuard> {
  const directory = requireDirectory(options.directory)
  const maxEntries = positiveInteger(
    options.maxEntries ?? MAX_REPLAY_ENTRIES,
    "Replay cache capacity is invalid.",
  )
  if (maxEntries > MAX_REPLAY_ENTRIES) {
    throw new GatewayError("INVALID_INPUT", "Replay cache capacity exceeds the hard limit.")
  }
  const busyTimeoutMs = nonNegativeInteger(
    options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS,
    "Replay cache lock timeout is invalid.",
  )
  if (busyTimeoutMs > MAX_BUSY_TIMEOUT_MS) {
    throw new GatewayError("INVALID_INPUT", "Replay cache lock timeout exceeds the hard limit.")
  }
  const now = options.now ?? Date.now

  ensurePrivateDirectory(directory)
  const path = replayPathIn(directory)
  ensurePrivateDatabaseFile(path)
  const identity = cacheIdentity(path)

  let database: Database
  try {
    database = new Database(path, { create: false, readwrite: true, strict: true })
  } catch {
    throw invalid("The local replay cache could not be opened safely.")
  }

  try {
    configure(database, busyTimeoutMs)
    initializeOrVerify(database)
    assertIntegrity(database)
    assertCacheIdentity(path, identity)
  } catch (cause) {
    try {
      database.close()
    } catch {
      // The sanitized startup failure below remains authoritative.
    }
    if (cause instanceof GatewayError) throw cause
    throw invalid("The local replay cache failed its integrity check.")
  }

  const prune = database.query("DELETE FROM replay_entries WHERE expires_at <= ?1")
  const insert = database.query(
    "INSERT OR IGNORE INTO replay_entries (job_id, expires_at) VALUES (?1, ?2)",
  )
  const count = database.query<CountRow, []>(
    "SELECT COUNT(*) AS count FROM replay_entries",
  )
  const evict = database.query(
    `DELETE FROM replay_entries
       WHERE sequence IN (
         SELECT sequence FROM replay_entries ORDER BY sequence ASC LIMIT ?1
       )`,
  )
  let closed = false

  const claim = database.transaction((jobId: string, timestamp: number, expiresAt: number) => {
    prune.run(timestamp)
    const inserted = insert.run(jobId, expiresAt)
    if (inserted.changes !== 1) return false

    const row = count.get()
    if (row === null || !Number.isSafeInteger(row.count) || row.count < 0) {
      throw new Error("invalid replay count")
    }
    const overflow = row.count - maxEntries
    if (overflow > 0) evict.run(overflow)
    return true
  })

  return {
    async remember(jobId: string, ttlMs: number): Promise<boolean> {
      if (closed) throw unavailable("The local replay cache is closed.")
      const id = requireJobId(jobId)
      const ttl = requireTtl(ttlMs)
      const timestamp = safeNow(now)
      const expiresAt = timestamp + ttl
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= timestamp) {
        throw new GatewayError("INVALID_INPUT", "Replay expiry is invalid.")
      }

      try {
        assertPrivateDirectory(directory)
        assertCacheIdentity(path, identity)
        // IMMEDIATE obtains the write reservation before pruning or checking the
        // UNIQUE key. Two processes cannot both accept the same id.
        return claim.immediate(id, timestamp, expiresAt)
      } catch (cause) {
        if (cause instanceof GatewayError) throw cause
        throw unavailable("The local replay cache transaction failed.")
      }
    },

    close(): void {
      if (closed) return
      closed = true
      try {
        database.close()
      } catch {
        // Closing happens during local process teardown; no job may run afterward.
      }
    },
  }
}

export function replayPathIn(directory: string): string {
  return join(directory, REPLAY_FILE_NAME)
}

function configure(database: Database, busyTimeoutMs: number): void {
  database.exec(`
    PRAGMA busy_timeout = ${busyTimeoutMs};
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA trusted_schema = OFF;
    PRAGMA temp_store = MEMORY;
    PRAGMA page_size = ${PAGE_SIZE_BYTES};
    PRAGMA max_page_count = ${MAX_PAGE_COUNT};
    PRAGMA auto_vacuum = INCREMENTAL;
  `)
}

function initializeOrVerify(database: Database): void {
  const initialize = database.transaction(() => {
    const version = database.query<VersionRow, []>("PRAGMA user_version").get()?.user_version
    if (version === 0) {
      const existing = database
        .query<CountRow, []>(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%'",
        )
        .get()?.count
      if (existing !== 0) {
        throw invalid("The local replay cache has no recognized schema version.")
      }
      database.exec(`
        CREATE TABLE replay_entries (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL UNIQUE,
          expires_at INTEGER NOT NULL CHECK (expires_at > 0)
        );
        CREATE INDEX replay_entries_by_expiry ON replay_entries (expires_at);
        PRAGMA user_version = ${SCHEMA_VERSION};
      `)
      return
    }
    if (version !== SCHEMA_VERSION) {
      throw invalid("The local replay cache has an unsupported schema version.")
    }
  })
  initialize.exclusive()

  const columns = database
    .query<TableInfoRow, []>("PRAGMA table_info(replay_entries)")
    .all()
  const shape = columns.map((column) => ({
    name: column.name,
    type: column.type.toUpperCase(),
    notnull: column.notnull,
    pk: column.pk,
  }))
  const expected = [
    { name: "sequence", type: "INTEGER", notnull: 0, pk: 1 },
    { name: "job_id", type: "TEXT", notnull: 1, pk: 0 },
    { name: "expires_at", type: "INTEGER", notnull: 1, pk: 0 },
  ]
  if (JSON.stringify(shape) !== JSON.stringify(expected)) {
    throw invalid("The local replay cache schema is invalid.")
  }

  const rows = database
    .query<CountRow, []>("SELECT COUNT(*) AS count FROM replay_entries")
    .get()?.count
  if (!Number.isSafeInteger(rows) || (rows ?? -1) < 0 || (rows ?? 0) > MAX_REPLAY_ENTRIES) {
    throw invalid("The local replay cache exceeds its entry limit.")
  }
}

function assertIntegrity(database: Database): void {
  const result = database
    .query<IntegrityRow, []>("PRAGMA quick_check(1)")
    .get()?.quick_check
  if (result !== "ok") {
    throw invalid("The local replay cache failed its integrity check.")
  }
}

function ensurePrivateDirectory(path: string): void {
  try {
    mkdirSync(path, { recursive: true, mode: DIR_MODE })
  } catch {
    throw unavailable("The local agent state directory could not be prepared.")
  }
  assertPrivateDirectory(path)
}

function assertPrivateDirectory(path: string): void {
  let metadata
  try {
    metadata = lstatSync(path)
  } catch {
    throw unavailable("The local agent state directory could not be inspected.")
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw denied("The local agent state directory is not a private directory.")
  }
  if (supportsPosixModes()) {
    // Creation honors the caller's umask, but an existing user-owned directory
    // may be stricter. Never silently loosen one; only tighten a fresh/existing
    // directory to the already-established agent invariant.
    try {
      chmodSync(path, DIR_MODE)
    } catch {
      throw unavailable("The local agent state directory could not be secured.")
    }
  }
  assertPrivateMode(lstatSync(path).mode, "state directory")
}

function ensurePrivateDatabaseFile(path: string): void {
  try {
    const metadata = lstatSync(path)
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw denied("The local replay cache is not a regular private file.")
    }
    assertPrivateMode(metadata.mode, REPLAY_CACHE)
    if (metadata.size > MAX_DATABASE_BYTES) {
      throw invalid("The local replay cache exceeds its size limit.")
    }
    return
  } catch (cause) {
    if (!isCode(cause, "ENOENT")) {
      if (cause instanceof GatewayError) throw cause
      throw unavailable("The local replay cache could not be inspected.")
    }
  }

  let descriptor: number | null = null
  try {
    const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
    descriptor = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | noFollow,
      FILE_MODE,
    )
    closeSync(descriptor)
    descriptor = null
    if (supportsPosixModes()) chmodSync(path, FILE_MODE)
  } catch (cause) {
    if (descriptor !== null) {
      try {
        closeSync(descriptor)
      } catch {
        // The safe inspection path below remains authoritative.
      }
    }
    if (!isCode(cause, "EEXIST")) {
      throw unavailable("The local replay cache could not be created.")
    }
  }

  const metadata = lstatSync(path)
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw denied("The local replay cache is not a regular private file.")
  }
  assertPrivateMode(metadata.mode, REPLAY_CACHE)
}

function cacheIdentity(path: string): CacheIdentity {
  const metadata = lstatSync(path)
  return { device: metadata.dev, inode: metadata.ino }
}

function assertCacheIdentity(path: string, expected: CacheIdentity): void {
  let metadata
  try {
    metadata = lstatSync(path)
  } catch {
    throw unavailable("The local replay cache could not be inspected.")
  }
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.dev !== expected.device ||
    metadata.ino !== expected.inode
  ) {
    throw denied("The local replay cache changed while the agent was running.")
  }
  assertPrivateMode(metadata.mode, REPLAY_CACHE)
  if (metadata.size > MAX_DATABASE_BYTES) {
    throw invalid("The local replay cache exceeds its size limit.")
  }
}

function requireDirectory(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new GatewayError("INVALID_INPUT", "A local agent state directory is required.")
  }
  return value.trim()
}

function requireJobId(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_REPLAY_JOB_ID_LENGTH ||
    hasControlCharacter(value)
  ) {
    throw new GatewayError("INVALID_INPUT", "A bounded job id is required.")
  }
  return value
}

function requireTtl(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new GatewayError("INVALID_INPUT", "A positive replay ttl is required.")
  }
  return value
}

function safeNow(clock: () => number): number {
  const value = clock()
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new GatewayError("INTERNAL", "The local replay clock is invalid.")
  }
  return value
}

function positiveInteger(value: number, message: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new GatewayError("INVALID_INPUT", message)
  }
  return value
}

function nonNegativeInteger(value: number, message: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new GatewayError("INVALID_INPUT", message)
  }
  return value
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isCode(value: unknown, code: string): boolean {
  return record(value) && value.code === code
}

function invalid(message: string): GatewayError {
  return new GatewayError("INVALID_INPUT", message)
}

function denied(message: string): GatewayError {
  return new GatewayError("NOT_AUTHORIZED", message)
}

function unavailable(message: string): GatewayError {
  return new GatewayError("INTERNAL", message)
}
