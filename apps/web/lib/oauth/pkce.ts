/**
 * PKCE (RFC 7636) and the random values around it.
 *
 * S256 only. `plain` is still legal in RFC 7636 and is forbidden by OAuth 2.1;
 * an authorization server that advertises only `plain` is one we refuse rather
 * than downgrade to.
 */
import { toBase64Url } from "@cg/auth"

/** 32 bytes -> 43 base64url characters, the length RFC 7636 §4.1 recommends. */
const VERIFIER_BYTES = 32

export type Pkce = { readonly verifier: string; readonly challenge: string }

function randomBase64Url(bytes: number): string {
  const raw = new Uint8Array(bytes)
  crypto.getRandomValues(raw)
  return toBase64Url(raw)
}

export async function createPkce(): Promise<Pkce> {
  const verifier = randomBase64Url(VERIFIER_BYTES)
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return { verifier, challenge: toBase64Url(new Uint8Array(digest)) }
}

/**
 * The `state` parameter. Its only job is to prove the callback belongs to the
 * flow this browser started — it is compared against the copy inside the sealed
 * state cookie, so a code delivered to a callback nobody initiated is dropped.
 */
export function createState(): string {
  return randomBase64Url(16)
}
