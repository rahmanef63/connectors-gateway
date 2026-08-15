/**
 * The agent's trust anchor for job signatures.
 *
 * The reference gateway delivers its job-signing key in the `welcome` frame
 * rather than at claim time, so the key is learned on first use and PINNED:
 * once a key is stored, a different one announced later is refused, not
 * adopted. A relay that could swap the agent's trust anchor at will would not
 * be a trust anchor (docs/14 "stolen device credential").
 *
 * ponytail: trust-on-first-use over an authenticated TLS session, then pin.
 * The upgrades, in order: return the key in the pairing claim (the human is
 * watching), then a signed key-rotation announcement.
 */
import { GatewayError } from "@cg/core"
import type { JobEnvelope, SignedJob } from "@cg/protocol"
import type { Logger } from "./log"
import { createJobVerifier, isKeyRotation } from "./verify"
import type { JobVerifier, PinnedKey } from "./verify"

export type TrustOutcome = "adopted" | "unchanged" | "conflict"

export type KeyStore = {
  /** Rejects every job until a key is pinned. */
  verify: JobVerifier
  trust(key: PinnedKey): Promise<TrustOutcome>
  pinned(): PinnedKey | undefined
}

export type KeyStoreOptions = {
  /** From the credential store, when a previous run already pinned a key. */
  initial?: PinnedKey | undefined
  /** Called once, when a key is first adopted, so it survives a restart. */
  persist?: (key: PinnedKey) => void
}

export function createKeyStore(options: KeyStoreOptions = {}): KeyStore {
  let pinned: PinnedKey | undefined = options.initial
  let verifier: JobVerifier | undefined

  const verifierFor = async (key: PinnedKey): Promise<JobVerifier> => {
    if (verifier === undefined) verifier = await createJobVerifier(key)
    return verifier
  }

  return {
    async verify(signed: SignedJob): Promise<JobEnvelope> {
      if (pinned === undefined) {
        throw new GatewayError("NOT_AUTHORIZED", "This device has not learned the gateway signing key yet.")
      }
      return (await verifierFor(pinned))(signed)
    },

    async trust(key: PinnedKey): Promise<TrustOutcome> {
      if (pinned !== undefined) return isKeyRotation(pinned, key) ? "conflict" : "unchanged"
      // Importing first means a malformed key is rejected before it is stored.
      verifier = await createJobVerifier(key)
      pinned = { signingPublicKey: key.signingPublicKey, keyId: key.keyId }
      options.persist?.(pinned)
      return "adopted"
    },

    pinned: () => pinned,
  }
}

/**
 * The session's view of a key announcement: trust it, say what happened, and
 * never throw — a bad key must not drop a working connection.
 */
export function createKeyTruster(
  keys: KeyStore | undefined,
  logger: Logger,
): (key: PinnedKey) => Promise<void> {
  return async (key: PinnedKey): Promise<void> => {
    if (keys === undefined) return
    try {
      const outcome = await keys.trust(key)
      if (outcome === "adopted") logger.info("pinned the gateway job-signing key")
      // A conflict is never adopted: jobs signed with the new key fail
      // NOT_AUTHORIZED until the user re-pairs deliberately.
      if (outcome === "conflict") logger.warn("the gateway announced a different job-signing key. Run: agent pair")
    } catch {
      logger.error("the gateway announced an unusable job-signing key")
    }
  }
}
