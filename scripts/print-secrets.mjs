/**
 * Shows what a given GATEWAY_SECRET expands into. `bun run secrets`
 *
 * Two jobs, both about trust:
 *
 *  - Answering "what will my deployment actually use?" without making anyone
 *    read HKDF labels out of a source file. Derivation is only reassuring if you
 *    can see it happen.
 *  - Producing the four explicit variables for a deployment that does NOT want
 *    to derive — an existing gateway with sealed credentials, say, which must
 *    keep its own CREDENTIAL_ENCRYPTION_KEY across a rotation.
 *
 * Output goes to STDOUT and nowhere else: nothing here writes a file, so a real
 * secret cannot end up committed (AGENTS.md invariant 12). Pipe it into a
 * password manager, not into `.env` in a shared checkout.
 *
 *   bun run secrets                       # uses $GATEWAY_SECRET
 *   bun run secrets -- --new              # mints a fresh root secret first
 *   bun run secrets -- <secret>           # inspects one you already hold
 */
import { deriveGatewaySecrets } from "../packages/auth/src/derive.ts"

const args = process.argv.slice(2)
const wantsNew = args.includes("--new")
const positional = args.find((value) => !value.startsWith("--"))

function mint() {
  const bytes = new Uint8Array(48)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

const secret = wantsNew ? mint() : (positional ?? process.env.GATEWAY_SECRET ?? "")

if (secret.length === 0) {
  console.error(
    [
      "No secret to expand.",
      "",
      "  bun run secrets -- --new       mint a fresh one",
      "  bun run secrets -- <secret>    inspect one you already have",
      "  GATEWAY_SECRET=… bun run secrets",
    ].join("\n"),
  )
  process.exit(1)
}

const derived = await deriveGatewaySecrets(secret)

process.stdout.write(
  [
    "# Derived from GATEWAY_SECRET. Set ONLY the first line in Vercel — the rest",
    "# are what every process computes from it, shown so you can verify them.",
    "",
    ...(wantsNew ? [`GATEWAY_SECRET=${secret}`, ""] : []),
    "# --- derived (do not set these unless you are overriding one) ---",
    `CREDENTIAL_ENCRYPTION_KEY=${derived.credentialEncryptionKey}`,
    `GATEWAY_SERVICE_TOKEN=${derived.serviceToken}`,
    `JOB_SIGNING_PRIVATE_KEY=${derived.jobSigningPrivateKey}`,
    `JOB_SIGNING_PUBLIC_KEY=${derived.jobSigningPublicKey}`,
    "JOB_SIGNING_KEY_ID=k1",
    "",
    "# Rotating GATEWAY_SECRET re-keys all four at once. Sealed connection",
    "# credentials become unopenable, so a deployment with live connections",
    "# should pin CREDENTIAL_ENCRYPTION_KEY explicitly and keep it.",
    "",
  ].join("\n"),
)
