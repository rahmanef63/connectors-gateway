/**
 * The Vercel build entry point (`vercel.json` → `bun run build:vercel`).
 *
 * It does three things, in this order, and the order is the whole design:
 *
 *   1. THE GATE — typecheck + the full test suite, on every path, before
 *      anything is allowed to touch Convex. Vercel's build is the only CI a
 *      clone has: `next build` type-checks apps/web and nothing else, and it has
 *      never run a test. Without this, a dependency bump that reds the policy
 *      tests deploys green and the first thing to notice is an AI client
 *      executing an action that should have been denied.
 *
 *   2. THE CONVEX ENVIRONMENT — provisions the auth keys and the gateway
 *      service token on the Convex deployment (scripts/setup-convex-env.mjs).
 *      Runs after the gate, so a red suite leaves the backend untouched.
 *
 *   3. THE BUILD — `convex deploy --cmd`, which pushes functions + schema and
 *      then builds Next with NEXT_PUBLIC_CONVEX_URL injected.
 *
 * MODES. Which of 2 and 3 happen depends on what the environment actually
 * carries:
 *
 *   deploy + build   CONVEX_DEPLOY_KEY present, and this is not a preview build
 *                    holding a production key.
 *   frontend-only    A preview build with a production/dev key (a PR preview
 *                    must never push its backend code to production), or no key
 *                    but NEXT_PUBLIC_CONVEX_URL is set.
 *   fail             On Vercel with neither — a misconfiguration, and cheaper to
 *                    say so now than after ten minutes of gate.
 *   plain build      Local `bun run build:vercel` with no Convex env at all.
 *
 * For real per-PR backends, set a PREVIEW deploy key (it starts with
 * "preview:") on Vercel's Preview environment. README → "Preview deploys".
 */
import { execFileSync } from "node:child_process"

const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", ...options })

const nextBuild = () => run("bun", ["run", "--cwd", "apps/web", "build"])

const key = process.env.CONVEX_DEPLOY_KEY
const url = process.env.NEXT_PUBLIC_CONVEX_URL
const onVercel = process.env.VERCEL === "1"
const isPreview = process.env.VERCEL_ENV === "preview"

if (!key && !url && onVercel) {
  console.error(
    "[build] Missing CONVEX_DEPLOY_KEY and NEXT_PUBLIC_CONVEX_URL. Set at least one in the Vercel project's environment variables — README → 'The variables you set'.",
  )
  process.exit(1)
}

/**
 * The gate. `GATE=off` exists for the one honest case — re-deploying a commit
 * you already validated, when a flaky upstream is the only thing red — and it
 * announces itself in the log so nobody discovers later that a deploy skipped
 * its checks quietly.
 */
function gate() {
  if (process.env.GATE === "off") {
    console.warn("[build] GATE=off — typecheck and tests SKIPPED for this build.")
    return
  }
  for (const [what, script] of [
    ["types (workspace)", "typecheck"],
    ["types (dashboard)", "typecheck:web"],
    ["tests (runtime)", "test"],
    ["tests (control plane)", "test:convex"],
  ]) {
    console.log(`[build] gate: ${what} — bun run ${script}`)
    try {
      run("bun", ["run", script])
    } catch {
      console.error(
        `[build] GATE FAILED: ${what}. Nothing was deployed — the Convex backend is untouched. Fix it and push again.`,
      )
      process.exit(1)
    }
  }
  console.log("[build] gate passed — types and tests green.")
}

gate()

if (key && isPreview && !key.startsWith("preview:")) {
  console.log(
    "[build] PREVIEW build holding a non-preview deploy key — skipping `convex deploy` so PR code cannot reach the production backend. Building the frontend only" +
      (url ? ` against ${url}.` : ". WARNING: NEXT_PUBLIC_CONVEX_URL is unset, so nothing will load."),
  )
  nextBuild()
} else if (key) {
  run("bun", ["scripts/setup-convex-env.mjs"])
  // `--cmd` runs from apps/web, where convex/ lives, and injects
  // NEXT_PUBLIC_CONVEX_URL into the Next build that follows.
  run("bunx", ["convex", "deploy", "--cmd", "bun run build"], { cwd: "apps/web" })
} else if (url) {
  console.log(
    "[build] No CONVEX_DEPLOY_KEY — building the frontend against the existing NEXT_PUBLIC_CONVEX_URL. The backend is NOT redeployed.",
  )
  nextBuild()
} else {
  nextBuild()
}
