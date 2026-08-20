import { afterEach, describe, expect, test } from "bun:test"
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { GatewayError } from "@cg/core"
import { supportsPosixModes } from "./file-mode"
import {
  REPLAY_FILE_NAME,
  createPersistentReplayGuard,
  replayPathIn,
  type PersistentReplayGuard,
} from "./replay-store"

const directories: string[] = []
const guards: PersistentReplayGuard[] = []
const NOW = 1_700_000_000_000

function directory(): string {
  const value = mkdtempSync(join(tmpdir(), "cg-replay-"))
  directories.push(value)
  return value
}

async function guard(
  dir: string,
  options: Partial<Parameters<typeof createPersistentReplayGuard>[0]> = {},
): Promise<PersistentReplayGuard> {
  const value = await createPersistentReplayGuard({
    directory: dir,
    now: () => NOW,
    ...options,
  })
  guards.push(value)
  return value
}

afterEach(() => {
  for (const value of guards.splice(0)) value.close()
  for (const value of directories.splice(0)) rmSync(value, { recursive: true, force: true })
})

describe("persistent replay guard", () => {
  test("survives a process-style close and reopen", async () => {
    const dir = directory()
    const first = await guard(dir)
    expect(await first.remember("job_restart", 60_000)).toBe(true)
    first.close()

    const restarted = await guard(dir)
    expect(await restarted.remember("job_restart", 60_000)).toBe(false)
    expect(await restarted.remember("job_new", 60_000)).toBe(true)
  })

  test("two independently opened guards share one atomic UNIQUE claim", async () => {
    const dir = directory()
    const first = await guard(dir)
    const second = await guard(dir)

    const accepted = await Promise.all([
      first.remember("job_shared", 60_000),
      second.remember("job_shared", 60_000),
    ])
    expect(accepted.sort()).toEqual([false, true])
  })

  test("an expired id is pruned and may be accepted again", async () => {
    const dir = directory()
    let clock = NOW
    const value = await guard(dir, { now: () => clock })
    expect(await value.remember("job_expiring", 100)).toBe(true)
    expect(await value.remember("job_expiring", 100)).toBe(false)
    clock += 101
    expect(await value.remember("job_expiring", 100)).toBe(true)
  })

  test("bounds entries by evicting the oldest accepted id", async () => {
    const dir = directory()
    const value = await guard(dir, { maxEntries: 2 })
    await value.remember("job_a", 60_000)
    await value.remember("job_b", 60_000)
    await value.remember("job_c", 60_000)
    value.close()

    const db = new Database(replayPathIn(dir), { readonly: true, strict: true })
    const rows = db
      .query<{ job_id: string }, []>(
        "SELECT job_id FROM replay_entries ORDER BY sequence ASC",
      )
      .all()
    db.close()
    expect(rows.map((row) => row.job_id)).toEqual(["job_b", "job_c"])
  })

  test("creates an owner-only database inside an owner-only directory", async () => {
    const dir = directory()
    const value = await guard(dir)
    await value.remember("job_mode", 60_000)
    if (!supportsPosixModes()) return
    expect(statSync(dir).mode & 0o777).toBe(0o700)
    expect(statSync(replayPathIn(dir)).mode & 0o777).toBe(0o600)
  })

  test("DENIED: refuses a world-readable existing cache", async () => {
    if (!supportsPosixModes()) return
    const dir = directory()
    const first = await guard(dir)
    first.close()
    chmodSync(replayPathIn(dir), 0o644)

    await expect(createPersistentReplayGuard({ directory: dir })).rejects.toMatchObject({
      code: "NOT_AUTHORIZED",
    })
  })

  test("DENIED: refuses a symlink rather than following it", async () => {
    if (process.platform === "win32") return
    const dir = directory()
    const target = join(dir, "attacker.sqlite")
    writeFileSync(target, "not a database", { mode: 0o600 })
    symlinkSync(target, join(dir, REPLAY_FILE_NAME))

    await expect(createPersistentReplayGuard({ directory: dir })).rejects.toMatchObject({
      code: "NOT_AUTHORIZED",
    })
  })

  test("DENIED: a corrupt database fails closed without echoing its body or path", async () => {
    const dir = directory()
    const secret = "sensitive-job-body"
    writeFileSync(replayPathIn(dir), secret, { mode: 0o600 })
    try {
      await createPersistentReplayGuard({ directory: dir })
      throw new Error("expected corrupt cache rejection")
    } catch (cause) {
      expect(cause).toBeInstanceOf(GatewayError)
      expect((cause as GatewayError).message).not.toContain(secret)
      expect((cause as GatewayError).message).not.toContain(dir)
    }
  })

  test("DENIED: a replaced database inode is detected before another claim", async () => {
    if (process.platform === "win32") return
    const dir = directory()
    const value = await guard(dir)
    await value.remember("job_before_replace", 60_000)
    const replacement = join(dir, "replacement.sqlite")
    writeFileSync(replacement, "replacement", { mode: 0o600 })
    rmSync(replayPathIn(dir))
    writeFileSync(replayPathIn(dir), "replacement", { mode: 0o600 })

    await expect(value.remember("job_after_replace", 60_000)).rejects.toMatchObject({
      code: "NOT_AUTHORIZED",
    })
  })

  test("a busy database times out and rejects the job instead of bypassing replay", async () => {
    const dir = directory()
    const value = await guard(dir, { busyTimeoutMs: 10 })
    const blocker = new Database(replayPathIn(dir), { strict: true })
    blocker.exec("PRAGMA busy_timeout = 10; BEGIN EXCLUSIVE;")
    try {
      await expect(value.remember("job_busy", 60_000)).rejects.toMatchObject({
        code: "INTERNAL",
      })
    } finally {
      blocker.exec("ROLLBACK")
      blocker.close()
    }
    expect(await value.remember("job_busy", 60_000)).toBe(true)
  })

  test("rejects invalid ids, ttl values and capacities before writing", async () => {
    const dir = directory()
    const value = await guard(dir)
    await expect(value.remember("", 1)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(value.remember("job\nlog", 1)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(value.remember("job", 0)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(
      createPersistentReplayGuard({ directory: dir, maxEntries: 10_001 }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })
  })
})
