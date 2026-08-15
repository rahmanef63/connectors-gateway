/**
 * Readers for everything the API-key functions hand back.
 *
 * Control-plane responses are external input: every field is read one at a time
 * and a row that fails its shape check is dropped rather than half-trusted.
 *
 * The raw key is recognised by its SHAPE, not by a field name. `issue` returns
 * the only copy of the secret that will ever exist, and guessing wrong about
 * whether it is called `token`, `key` or `apiKey` would silently lose it.
 */
import { API_KEY_TOKEN_PATTERN } from "@/lib/gateway-config"

/** A key as the table renders it. Never carries secret material. */
export type ApiKeyView = {
  keyId: string
  /** Empty when the row has no label — the view supplies the copy, not this. */
  label: string
  status: string
  createdAt: number | undefined
  lastUsedAt: number | undefined
}

/** The one-time result of `issue`. Lives in React state for one page view. */
export type IssuedKey = {
  /** `cgk_<keyId>_<secret>` — shown once, never persisted. */
  token: string
  /** Parsed out of the token itself, so it needs no field of its own. */
  keyId: string
}

/** Checked first, in this order, before falling back to any other string. */
const TOKEN_FIELDS = ["token", "key", "apiKey", "secret", "value"] as const

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function asIssued(value: unknown): IssuedKey | null {
  if (typeof value !== "string") return null
  const match = API_KEY_TOKEN_PATTERN.exec(value)
  const keyId = match?.[1]
  return keyId === undefined ? null : { token: value, keyId }
}

/**
 * The raw key out of an `issue` result — a bare string, or the first
 * token-shaped string on the returned object. Anything else is `null`, which
 * the caller reports honestly instead of pretending the key was shown.
 */
export function readIssuedKey(result: unknown): IssuedKey | null {
  const direct = asIssued(result)
  if (direct !== null) return direct
  if (!isPlainRecord(result)) return null

  for (const field of TOKEN_FIELDS) {
    const found = asIssued(result[field])
    if (found !== null) return found
  }
  // Deterministic sweep of whatever is left, so a field we did not predict
  // still yields the key rather than dropping it on the floor.
  for (const field of Object.keys(result).sort()) {
    const found = asIssued(result[field])
    if (found !== null) return found
  }
  return null
}

/** One row → a view, or `null` when it carries no usable identity. */
export function readApiKeyView(row: unknown): ApiKeyView | null {
  if (!isPlainRecord(row)) return null
  // `keyId` is this deployment's name for it; `id` is what @cg/auth calls the
  // same field, so both are accepted rather than rendering an unrevokable row.
  const keyId = readString(row.keyId) ?? readString(row.id)
  if (keyId === undefined) return null
  return {
    keyId,
    label: readString(row.label) ?? "",
    status: readString(row.status) ?? "unknown",
    createdAt: readNumber(row.createdAt) ?? readNumber(row._creationTime),
    lastUsedAt: readNumber(row.lastUsedAt),
  }
}

/** Newest first: the key someone just made is the one they are looking for. */
export function readApiKeyViews(rows: unknown): ApiKeyView[] {
  if (!Array.isArray(rows)) return []
  const views: ApiKeyView[] = []
  for (const row of rows) {
    const view = readApiKeyView(row)
    if (view !== null) views.push(view)
  }
  return views.sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
}
