/**
 * Server-side sealing of upstream credentials.
 *
 * WHAT CHANGED, AND WHY IT IS NOT A REGRESSION. Until now only the gateway
 * process held `CREDENTIAL_ENCRYPTION_KEY`, and the connect form told the
 * operator to SSH to the gateway host, run a CLI, and paste the ciphertext
 * back. That is unusable for anyone who is not the operator, and it is
 * impossible for OAuth: the token arrives on a redirect handled by THIS
 * process, so if this process cannot seal, there is no automatic connect flow
 * at all.
 *
 * The property that actually protects a user is unchanged: Convex — the
 * database — never sees the key or the plaintext. It stores ciphertext it
 * cannot open. What widened is that two of our own server processes now hold
 * the key instead of one.
 *
 * Never import this from a client component. The key is read from a plain
 * server env var (never NEXT_PUBLIC_), and Next would refuse to bundle it, but
 * the intent is worth stating.
 */
import { open, seal } from "@cg/auth"

const ENV_VAR = "CREDENTIAL_ENCRYPTION_KEY"

export class SealUnavailableError extends Error {
  constructor() {
    super(`${ENV_VAR} is not set on the dashboard.`)
    this.name = "SealUnavailableError"
  }
}

/** True when this deployment can store credentials at all. */
export function sealingAvailable(): boolean {
  return (process.env[ENV_VAR] ?? "").length > 0
}

/**
 * `v1.<iv>.<ciphertext>` — the exact envelope the gateway opens.
 *
 * Throws rather than returning the plaintext on a missing key: a connection row
 * holding a raw token would look active and fail on every call, which is the
 * one failure mode this whole path exists to prevent.
 */
export async function sealCredential(plaintext: string): Promise<string> {
  const key = process.env[ENV_VAR] ?? ""
  if (key.length === 0) throw new SealUnavailableError()
  return await seal(plaintext, key)
}

/**
 * Opens what this process sealed — used ONLY for the in-flight OAuth state
 * cookie (`lib/oauth/state.ts`), which has to survive a redirect through a
 * third party and come back readable.
 *
 * Stored connection credentials are never opened here: the dashboard has no
 * reason to read one, and every screen that lists connections shows summaries
 * that the Convex query builds without the ciphertext.
 */
export async function unsealCredential(sealed: string): Promise<string> {
  const key = process.env[ENV_VAR] ?? ""
  if (key.length === 0) throw new SealUnavailableError()
  return await open(sealed, key)
}
