/**
 * Two-part credential format: `<prefix>_<id>_<secret>`.
 * The id travels in clear so the server can look the record up by primary key
 * and hash only the secret — no "hash every row" scan.
 */
import { GatewayError } from "@cg/core"
import { toHex } from "./base64url"

export const TOKEN_PREFIXES = {
  /** AI-client API key. */
  apiKey: "cgk",
  /** Local-device credential. */
  device: "cgd",
} as const

export type TokenPrefix = (typeof TOKEN_PREFIXES)[keyof typeof TOKEN_PREFIXES]

export type ParsedToken = { id: string; secret: string }

/**
 * Exactly three fields. The id may itself contain `_` (ids are prefixed, e.g.
 * `dev_ab12`), so the boundary is the LAST `_`; the secret charset deliberately
 * excludes `_` to keep that split unambiguous.
 */
const TOKEN_RE = /^([a-z]{2,8})_([A-Za-z0-9][A-Za-z0-9_-]{0,127})_([A-Za-z0-9-]{16,512})$/
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const SECRET_RE = /^[A-Za-z0-9-]{16,512}$/

/** 256-bit hex secret. Hex, not base64url, because base64url contains `_`. */
export function newCredentialSecret(bytes = 32): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return toHex(buffer)
}

export function formatToken(prefix: TokenPrefix, id: string, secret: string): string {
  if (!isTokenPrefix(prefix) || !ID_RE.test(id) || !SECRET_RE.test(secret)) {
    // Generic message: never echo the id or the secret back (P0).
    throw new GatewayError("INVALID_INPUT", "Cannot format a credential from these parts.")
  }
  return `${prefix}_${id}_${secret}`
}

/** Strict: wrong prefix, wrong shape, or a stray field all yield null. */
export function parseToken(prefix: TokenPrefix, token: string): ParsedToken | null {
  if (typeof token !== "string" || !isTokenPrefix(prefix)) return null
  const match = TOKEN_RE.exec(token)
  if (!match) return null
  const [, actualPrefix, id, secret] = match
  if (actualPrefix !== prefix || id === undefined || secret === undefined) return null
  return { id, secret }
}

export function isTokenPrefix(value: unknown): value is TokenPrefix {
  return (
    typeof value === "string" &&
    (Object.values(TOKEN_PREFIXES) as string[]).includes(value)
  )
}
