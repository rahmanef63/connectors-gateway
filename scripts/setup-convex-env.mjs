/**
 * Build-time provisioning of the Convex deployment's environment, so a clone
 * never has to open a Convex dashboard to get a working login and a gateway
 * that Convex will actually talk to.
 *
 * WHY IT CAN DO THIS AT ALL. `CONVEX_DEPLOY_KEY` grants env write on the
 * deployment. Vercel's environment is the opposite: a build can READ it and
 * has no token to write it — which is exactly why the gateway's four secrets are
 * DERIVED from one `GATEWAY_SECRET` (packages/auth/src/derive.ts) instead of
 * generated here. The value this script pushes to Convex is the same value the
 * Next.js process will derive at runtime, because both computed it from the same
 * root, not because anyone copied it twice.
 *
 * WHAT IT SETS:
 *   JWT_PRIVATE_KEY + JWKS      @convex-dev/auth signing keys. Generated once
 *                               and never regenerated — a fresh pair on every
 *                               deploy would sign every user out on every push.
 *   SITE_URL                    Where auth redirects land.
 *   GATEWAY_SERVICE_TOKEN       Proves "this caller is the gateway process" to
 *                               Convex. Derived; only written when it differs.
 *
 * WHAT IT DELIBERATELY DOES NOT SET: ADMIN_EMAILS, AUTH_GOOGLE_ID,
 * AUTH_GOOGLE_SECRET. Each of those is a decision, not a default — an invented
 * admin list is a security hole with a friendly face.
 *
 * SAFETY. No `convex env set` invocation is ever echoed: the argument contains a
 * private key, and an uncaught execFileSync error prints the command it ran. A
 * permission failure does NOT fail the build — the site goes live and the log
 * says exactly which key to replace — because a half-deployed clone that cannot
 * explain itself is worse than one that is live and honest about what is
 * missing.
 */
import { execFileSync } from "node:child_process"

const CWD = "apps/web"

if (!process.env.CONVEX_DEPLOY_KEY) {
  console.log("[setup-convex] no CONVEX_DEPLOY_KEY — skipping (local or demo build).")
  process.exit(0)
}

/** Reads never carry a secret in their ARGUMENTS, so they may be echoed. */
function envGet(name) {
  try {
    return execFileSync("bunx", ["convex", "env", "get", name], {
      cwd: CWD,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return ""
  }
}

/**
 * Set one variable. Never rethrows and never prints the value — only convex's
 * own error lines, which carry no secret.
 */
function envSet(pair, label) {
  try {
    execFileSync("bunx", ["convex", "env", "set", pair], {
      cwd: CWD,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    console.log(`[setup-convex] set ${label} ✔`)
    return true
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`
    const denied = /403|Unauthorized|WriteEnvironmentVariables/i.test(output)
    console.error(
      `[setup-convex] ✖ could not set ${label}${denied ? " — this deploy key has no env-write permission (WriteEnvironmentVariables)" : ""}`,
    )
    const firstLines = output.trim().split("\n").slice(0, 2).join("\n")
    if (firstLines) console.error(firstLines)
    return false
  }
}

/**
 * An RS256 keypair in the two encodings @convex-dev/auth expects, built with
 * WebCrypto rather than `jose`.
 *
 * Not a dependency-avoidance flex: this script runs inside a Vercel build, where
 * every added package is another thing that can fail to resolve in an
 * environment nobody can attach a debugger to. WebCrypto is in Bun, Node 22 and
 * the Convex runtime already, and the two encodings below are the whole of what
 * `jose`'s `exportPKCS8` + `exportJWK` were doing here.
 *
 * `key_ops` and `ext` are stripped from the public JWK: they are WebCrypto
 * bookkeeping, absent from a `jose` export, and a JWKS should carry the key and
 * nothing else.
 */
async function generateAuthKeys() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )

  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))
  let binary = ""
  for (const byte of der) binary += String.fromCharCode(byte)
  const body = btoa(binary).replace(/(.{64})/g, "$1\n").trimEnd()
  const pem = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`
  // Same shape `bunx @convex-dev/auth` writes: PKCS8 PEM with newlines as spaces.
  const privateKey = pem.replace(/\n/g, " ")

  const { key_ops: _ops, ext: _ext, ...publicJwk } = await crypto.subtle.exportKey(
    "jwk",
    pair.publicKey,
  )
  return { privateKey, jwks: JSON.stringify({ keys: [{ use: "sig", ...publicJwk }] }) }
}

const siteUrl =
  process.env.SITE_URL ||
  process.env.APP_ORIGIN ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "")

let failed = false

// ---------------------------------------------------------------- auth keys
if (envGet("JWT_PRIVATE_KEY")) {
  console.log("[setup-convex] auth keys already provisioned — leaving them alone.")
} else {
  console.log("[setup-convex] generating @convex-dev/auth signing keys…")
  const { privateKey, jwks } = await generateAuthKeys()

  // NAME=value form, because the value starts with "-----BEGIN" and the CLI
  // would otherwise read it as a flag. The two must land as a PAIR: if the
  // second fails, roll the first back, or the idempotency check above will
  // happily skip a broken half-pair on every future build.
  let ok = envSet(`JWT_PRIVATE_KEY=${privateKey}`, "JWT_PRIVATE_KEY")
  if (ok) {
    ok = envSet(`JWKS=${jwks}`, "JWKS")
    if (!ok) {
      try {
        execFileSync("bunx", ["convex", "env", "remove", "JWT_PRIVATE_KEY"], {
          cwd: CWD,
          stdio: ["ignore", "pipe", "ignore"],
        })
      } catch {
        /* best effort — the next build's idempotency check reports the state. */
      }
    }
  }
  failed ||= !ok
}

// ------------------------------------------------------------------ site url
if (siteUrl) {
  if (envGet("SITE_URL") !== siteUrl) envSet(`SITE_URL=${siteUrl}`, "SITE_URL")
} else {
  console.warn("[setup-convex] SITE_URL could not be derived — auth redirects may fail.")
}

// ------------------------------------------------------- gateway service token
//
// Derived, not generated: the Next.js process derives the same value from the
// same GATEWAY_SECRET, so the two agree without either of them storing it.
if (process.env.GATEWAY_SECRET) {
  const { deriveGatewaySecrets } = await import("../packages/auth/src/derive.ts")
  const derived = await deriveGatewaySecrets(process.env.GATEWAY_SECRET)
  const wanted = process.env.GATEWAY_SERVICE_TOKEN?.trim() || derived.serviceToken
  // Compared before writing so a redeploy is a no-op rather than a write of the
  // same bytes. The comparison is of a value this process already holds.
  if (envGet("GATEWAY_SERVICE_TOKEN") !== wanted) {
    failed ||= !envSet(`GATEWAY_SERVICE_TOKEN=${wanted}`, "GATEWAY_SERVICE_TOKEN")
  } else {
    console.log("[setup-convex] GATEWAY_SERVICE_TOKEN already matches — no write.")
  }
} else if (process.env.GATEWAY_SERVICE_TOKEN) {
  if (envGet("GATEWAY_SERVICE_TOKEN") !== process.env.GATEWAY_SERVICE_TOKEN) {
    failed ||= !envSet(
      `GATEWAY_SERVICE_TOKEN=${process.env.GATEWAY_SERVICE_TOKEN}`,
      "GATEWAY_SERVICE_TOKEN",
    )
  }
} else {
  console.warn(
    "[setup-convex] neither GATEWAY_SECRET nor GATEWAY_SERVICE_TOKEN is set — the gateway will not be able to reach Convex. README → 'The variables you set'.",
  )
}

if (failed) {
  console.error(`
[setup-convex] ─────────────────────────────────────────────
  Some values were NOT provisioned. The usual causes:
   1. The deploy key lacks env capabilities. In the Convex deploy-key UI
      the key needs deployment:deploy + deployment:env:view +
      deployment:env:write (or pick full access). Generate one at
      dashboard.convex.dev → project → Production → Settings → Deploy Keys.
   2. The key's creator is not an admin / Project Admin on that Convex team.
  The build CONTINUES: the site will go live, but sign-in and/or the
  gateway's control-plane calls will fail until you replace
  CONVEX_DEPLOY_KEY in Vercel and redeploy.
──────────────────────────────────────────────────────────`)
}

process.exit(0)
