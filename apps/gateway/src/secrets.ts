/**
 * Crypto material resolution at boot.
 *
 * In production `loadConfig` has already refused to start without real values,
 * so the generated branches below are development-only conveniences. They are
 * announced loudly, because an ephemeral encryption key silently makes every
 * previously sealed connection credential unreadable after a restart.
 */
import { toBase64Url } from "@cg/auth"
import type { Logger } from "@cg/observability"
import { generateSigningKeyPair, importPrivateKey } from "@cg/protocol"
import type { GatewayConfig } from "./config"

export type GatewaySecrets = {
  /** Never exported, never logged. */
  signingPrivateKey: CryptoKey
  /** base64 SPKI — safe to hand to an agent in `welcome`. */
  signingPublicKey: string
  keyId: string
  /** base64 AES-256-GCM key for connection credentials at rest. */
  credentialKey: string
}

function randomKeyB64(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

export async function resolveSecrets(
  config: GatewayConfig,
  logger: Logger,
): Promise<GatewaySecrets> {
  let privateKeyB64 = config.signing.privateKey
  let publicKeyB64 = config.signing.publicKey

  if (privateKeyB64 === "" || publicKeyB64 === "") {
    const generated = await generateSigningKeyPair()
    privateKeyB64 = generated.privateKey
    publicKeyB64 = generated.publicKey
    logger.warn("using an EPHEMERAL job-signing keypair", {
      hint: "set JOB_SIGNING_PRIVATE_KEY and JOB_SIGNING_PUBLIC_KEY (bun run keygen)",
    })
  }

  let credentialKey = config.credentialEncryptionKey
  if (credentialKey === "") {
    credentialKey = randomKeyB64()
    logger.warn("using an EPHEMERAL credential encryption key", {
      hint: "set CREDENTIAL_ENCRYPTION_KEY; sealed credentials will not survive a restart",
    })
  }

  return {
    signingPrivateKey: await importPrivateKey(privateKeyB64),
    signingPublicKey: publicKeyB64,
    keyId: config.signing.keyId,
    credentialKey,
  }
}
