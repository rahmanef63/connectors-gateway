/**
 * Pull upstream template commits into a clone. `bun run update:template`
 *
 * A fork stops receiving upstream commits the moment it is created. This adds
 * the template as a remote, fetches it, and SHOWS you what is new — then stops.
 *
 * It deliberately does not merge. Merging into code you have since changed is a
 * decision, not a chore: you are the only one who knows whether your edit to
 * `connectors.ts` or `AGENTS.md` should survive the upstream version of it.
 * Nor does it run on a dirty tree, because a merge conflict on top of uncommitted
 * work is the hardest state to reason your way out of.
 */
import { execFileSync } from "node:child_process"

const REMOTE = "template"
const URL = process.env.TEMPLATE_REMOTE_URL ?? "https://github.com/rahmanef63/connectors-gateway.git"
const BRANCH = process.env.TEMPLATE_BRANCH ?? "main"

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim()
const gitLoud = (...args) => execFileSync("git", args, { stdio: "inherit" })

function fail(message) {
  console.error(`[update-template] ${message}`)
  process.exit(1)
}

try {
  git("rev-parse", "--git-dir")
} catch {
  fail("not a git repository.")
}

if (git("status", "--porcelain").length > 0) {
  fail("the working tree is dirty. Commit or stash first — a merge conflict on top of uncommitted work is the worst place to be.")
}

const remotes = git("remote").split("\n").filter(Boolean)
if (!remotes.includes(REMOTE)) {
  console.log(`[update-template] adding remote "${REMOTE}" → ${URL}`)
  git("remote", "add", REMOTE, URL)
} else {
  const current = git("remote", "get-url", REMOTE)
  if (current !== URL) {
    console.log(`[update-template] pointing "${REMOTE}" at ${URL} (was ${current})`)
    git("remote", "set-url", REMOTE, URL)
  }
}

console.log(`[update-template] fetching ${REMOTE}/${BRANCH}…`)
gitLoud("fetch", REMOTE, BRANCH, "--quiet")

const range = `HEAD..${REMOTE}/${BRANCH}`
const commits = git("log", "--oneline", range)

if (commits.length === 0) {
  console.log("[update-template] already up to date with the template.")
  process.exit(0)
}

const count = commits.split("\n").length
console.log(`\n[update-template] ${count} upstream commit${count === 1 ? "" : "s"} you do not have:\n`)
console.log(commits)
console.log(`\n[update-template] files they touch:\n`)
gitLoud("diff", "--stat", `HEAD...${REMOTE}/${BRANCH}`)

console.log(`
[update-template] Nothing has been merged. When you are ready:

  git merge ${REMOTE}/${BRANCH}     # expect conflicts where you edited the same files
  bun install && bun run validate
  git push                          # Vercel rebuilds; Convex deploys with it

The files a clone most often diverges on are adapters/remote-mcp/connectors/*,
adapters/remote-mcp/src/connectors.ts, README.md and AGENTS.md. Keeping your
connectors in their own files — and selecting them with CONNECTORS_ENABLED
rather than by deleting the shipped ones — is what keeps this merge small.
`)
