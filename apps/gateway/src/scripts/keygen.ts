/**
 * Prints an Ed25519 job-signing keypair for .env.
 *
 * Output goes to STDOUT and nowhere else: it is never written to a file, so a
 * generated secret cannot end up committed (AGENTS.md invariant 12).
 * Run: bun run --cwd apps/gateway keygen
 */
import { generateSigningKeyPair } from "@cg/protocol"

const pair = await generateSigningKeyPair()

process.stdout.write(
  [
    "# Ed25519 job-signing keypair — paste into .env (never into .env.example).",
    `JOB_SIGNING_PRIVATE_KEY=${pair.privateKey}`,
    `JOB_SIGNING_PUBLIC_KEY=${pair.publicKey}`,
    "JOB_SIGNING_KEY_ID=k1",
    "",
    "# Credential encryption key (AES-256-GCM):",
    `CREDENTIAL_ENCRYPTION_KEY=${randomKey()}`,
    "",
  ].join("\n"),
)

function randomKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}
