/**
 * One secret in, the whole gateway crypto set out (docs/20-vercel-template.md).
 *
 * WHY THIS EXISTS. A cloner deploying from a Vercel Deploy Button can be asked
 * for values, but nothing can WRITE values back: the build has a Convex deploy
 * key, so it can provision the Convex side (scripts/setup-convex-env.mjs), but
 * it holds no Vercel API token and therefore cannot mint an env var for the
 * running Next.js process. Four independently-generated secrets would mean four
 * `openssl` invocations pasted into a form before the first deploy — and any one
 * of them mistyped fails at a different layer, hours later.
 *
 * So the four are DERIVED, not generated: `GATEWAY_SECRET` is the only thing a
 * human handles, and every process that needs a piece of the set derives the
 * same piece from it. The Convex deployment and the Next.js process agree on the
 * service token because they computed it, not because someone copied it twice.
 *
 * WHAT THIS IS NOT. This is not a way to make one secret do the work of four.
 * HKDF (RFC 5869) with distinct `info` labels gives four values that are
 * independent in the sense that matters here — recovering one tells an attacker
 * nothing about the others — but they share one root. `GATEWAY_SECRET` is
 * therefore the compromise-everything secret: rotating it re-keys the whole
 * deployment at once, which is exactly why every derived value is re-derived on
 * demand and none of them is ever written to disk.
 *
 * WHAT IT DOES NOT COVER. `CREDENTIAL_ENCRYPTION_KEY` is derived here like the
 * rest, and that has a consequence a caller must accept before using it: rotate
 * `GATEWAY_SECRET` and every stored connection credential becomes unopenable,
 * because the key that sealed them no longer exists. A deployment that has real
 * connections should set `CREDENTIAL_ENCRYPTION_KEY` explicitly and keep it
 * across rotations — `resolveGatewaySecrets` treats an explicit value as
 * authoritative for exactly this reason.
 *
 * Pure WebCrypto, no dependency: the same code runs in Bun, in Node 22 under
 * Next.js, and in the Convex runtime.
 */
import { GatewayError } from "@cg/core"
import { fromBase64Url, toBase64Url } from "./base64url"

/** Root-secret floor. 24 bytes of base64 is ~32 characters; below that a value
 *  is almost certainly a placeholder someone forgot to replace. */
const MIN_SECRET_LENGTH = 32

const encoder = new TextEncoder()

/**
 * HKDF labels. NEVER change one of these strings: every label is a permanent
 * part of the mapping from a deployment's root secret to its keys, so an edit
 * here silently re-keys every clone that upgrades — sealed credentials stop
 * opening and paired agents stop trusting the gateway's signature.
 */
const LABELS = {
  credentialEncryption: "connectors-gateway/v1/credential-encryption",
  serviceToken: "connectors-gateway/v1/gateway-service-token",
  jobSigningSeed: "connectors-gateway/v1/job-signing-ed25519-seed",
} as const

/**
 * RFC 8410 §7. An Ed25519 PKCS#8 private key is a fixed 16-byte DER header
 * followed by the 32-byte seed — there is nothing else in it, which is what
 * makes "derive a seed" and "derive a keypair" the same operation.
 */
const PKCS8_ED25519_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
  0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
])

export type DerivedGatewaySecrets = {
  /** base64, 32 bytes — AES-256-GCM key for credentials at rest. */
  credentialEncryptionKey: string
  /** base64url, 32 bytes — proves "this caller is the gateway" to Convex. */
  serviceToken: string
  /** base64 PKCS#8. Secret. */
  jobSigningPrivateKey: string
  /** base64 SPKI. Public — the agent receives it in `welcome`. */
  jobSigningPublicKey: string
}

function requireSecret(secret: string): string {
  if (typeof secret !== "string" || secret.trim().length < MIN_SECRET_LENGTH) {
    throw new GatewayError(
      "INVALID_INPUT",
      `GATEWAY_SECRET must be at least ${MIN_SECRET_LENGTH} characters. Generate one with: openssl rand -base64 48`,
    )
  }
  return secret.trim()
}

/**
 * HKDF-SHA256, empty salt. The salt is empty on purpose rather than by
 * omission: there is no second party to agree one with, and the `info` label
 * already domain-separates the four outputs.
 */
async function hkdf(secret: string, label: string, bytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveBits"])
  const derived = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: encoder.encode(label) },
    key,
    bytes * 8,
  )
  return new Uint8Array(derived)
}

/** Standard base64 (not base64url): `CREDENTIAL_ENCRYPTION_KEY` is documented as
 *  `openssl rand -base64 32` output, and a derived value must look like one. */
function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * Ed25519 keypair from a 32-byte seed.
 *
 * The public half is read back out of the private key's JWK rather than
 * recomputed: WebCrypto has no "public key from private key" call, but an OKP
 * JWK export carries both `d` (the seed) and `x` (the public point), and taking
 * `x` from the runtime's own export is the one path that cannot disagree with
 * the key the runtime will actually sign with.
 */
async function signingPairFromSeed(seed: Uint8Array): Promise<{ privateKey: string; publicKey: string }> {
  const pkcs8 = new Uint8Array(PKCS8_ED25519_PREFIX.length + seed.length)
  pkcs8.set(PKCS8_ED25519_PREFIX, 0)
  pkcs8.set(seed, PKCS8_ED25519_PREFIX.length)

  // extractable: true is required — the JWK export below IS the derivation.
  // This key never leaves the process that derived it.
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"])
  const jwk = (await crypto.subtle.exportKey("jwk", privateKey)) as { x?: string }
  if (typeof jwk.x !== "string" || jwk.x.length === 0) {
    throw new GatewayError("INTERNAL", "The runtime did not return an Ed25519 public point.")
  }

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "OKP", crv: "Ed25519", x: jwk.x },
    { name: "Ed25519" },
    true,
    ["verify"],
  )
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", publicKey))
  return { privateKey: toBase64(pkcs8), publicKey: toBase64(spki) }
}

/** Every value a gateway needs, derived from one root secret. Deterministic:
 *  the same secret yields the same set on every host, every process, forever. */
export async function deriveGatewaySecrets(secret: string): Promise<DerivedGatewaySecrets> {
  const root = requireSecret(secret)
  const [credential, service, seed] = await Promise.all([
    hkdf(root, LABELS.credentialEncryption, 32),
    hkdf(root, LABELS.serviceToken, 32),
    hkdf(root, LABELS.jobSigningSeed, 32),
  ])
  const signing = await signingPairFromSeed(seed)
  return {
    credentialEncryptionKey: toBase64(credential),
    serviceToken: toBase64Url(service),
    jobSigningPrivateKey: signing.privateKey,
    jobSigningPublicKey: signing.publicKey,
  }
}

/**
 * The five values as they appear in the environment.
 *
 * The index signature is not decoration: without it this is a "weak type" —
 * every property optional — and TypeScript then REJECTS an environment object
 * that happens to carry none of these names, which is exactly the object a
 * pre-derivation deployment passes. It is also simply what this is: an
 * environment, whose other keys are none of this module's business.
 */
export type GatewaySecretEnv = {
  GATEWAY_SECRET?: string | undefined
  CREDENTIAL_ENCRYPTION_KEY?: string | undefined
  GATEWAY_SERVICE_TOKEN?: string | undefined
  JOB_SIGNING_PRIVATE_KEY?: string | undefined
  JOB_SIGNING_PUBLIC_KEY?: string | undefined
  [key: string]: string | undefined
}

/**
 * Explicit beats derived, per variable.
 *
 * The precedence is not a preference, it is a migration path: an existing
 * deployment has four independently-generated secrets and sealed data under
 * one of them, so setting `GATEWAY_SECRET` must never silently replace a key
 * that is already opening credentials. A clone sets only `GATEWAY_SECRET` and
 * gets all four; a mature deployment overrides the ones it owns; both run the
 * same code path.
 *
 * Returns the env unchanged when `GATEWAY_SECRET` is absent — including when
 * that leaves values missing. Reporting a missing variable is `loadConfig`'s
 * job and it names them one at a time; guessing here would replace a precise
 * error with a vague one.
 */
export async function resolveGatewaySecrets<T extends GatewaySecretEnv>(
  env: T,
): Promise<T & GatewaySecretEnv> {
  const root = (env.GATEWAY_SECRET ?? "").trim()
  if (root.length === 0) return env

  const derived = await deriveGatewaySecrets(root)
  const keep = (value: string | undefined, fallback: string): string =>
    typeof value === "string" && value.trim().length > 0 ? value : fallback

  return {
    ...env,
    CREDENTIAL_ENCRYPTION_KEY: keep(env.CREDENTIAL_ENCRYPTION_KEY, derived.credentialEncryptionKey),
    GATEWAY_SERVICE_TOKEN: keep(env.GATEWAY_SERVICE_TOKEN, derived.serviceToken),
    JOB_SIGNING_PRIVATE_KEY: keep(env.JOB_SIGNING_PRIVATE_KEY, derived.jobSigningPrivateKey),
    JOB_SIGNING_PUBLIC_KEY: keep(env.JOB_SIGNING_PUBLIC_KEY, derived.jobSigningPublicKey),
  }
}

/** Round-trip guard for the derivation: the derived pair must actually sign and
 *  verify. Used by the setup script so a broken runtime fails at build time, in
 *  a log a human is reading, rather than at the first job dispatch. */
export async function assertDerivable(secret: string): Promise<void> {
  const derived = await deriveGatewaySecrets(secret)
  const bytes = fromBase64Url(derived.jobSigningPrivateKey)
  if (!bytes || bytes.length !== PKCS8_ED25519_PREFIX.length + 32) {
    throw new GatewayError("INTERNAL", "Derived job-signing key has the wrong length.")
  }
}
