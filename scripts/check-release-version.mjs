import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const expected = readFileSync("VERSION", "utf8").trim()
if (!/^\d+\.\d+\.\d+$/.test(expected)) fail("VERSION must contain one semver release")

const packageFiles = ["package.json"]
for (const root of ["apps", "packages", "adapters"]) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) packageFiles.push(join(root, entry.name, "package.json"))
  }
}

for (const file of packageFiles) {
  const pkg = JSON.parse(readFileSync(file, "utf8"))
  if (file === "package.json" || String(pkg.name ?? "").startsWith("@cg/")) {
    if (pkg.version !== expected) fail(`${file} is ${pkg.version ?? "missing"}; expected ${expected}`)
  }
}

const lock = readFileSync("bun.lock", "utf8")
for (const file of packageFiles.filter((file) => file !== "package.json")) {
  const pkg = JSON.parse(readFileSync(file, "utf8"))
  if (!String(pkg.name ?? "").startsWith("@cg/")) continue
  const escaped = String(pkg.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const workspaceEntry = new RegExp(`"name": "${escaped}",\\s+"version": "${expected.replaceAll(".", "\\.")}"`)
  if (!workspaceEntry.test(lock)) fail(`bun.lock does not pin ${pkg.name} at ${expected}`)
}

const exactSources = [
  ["apps/gateway/src/mcp/server.ts", `version: "${expected}"`],
  ["apps/agent/src/identity.ts", `AGENT_VERSION = "${expected}"`],
  ["adapters/remote-mcp/src/mcp-client.ts", `name: "connectors-gateway", version: "${expected}"`],
  ["adapters/remote-mcp/src/verify-endpoints.ts", `name: "connector-gateway-endpoint-verifier", version: "${expected}"`],
  ["README.md", `**Current release: v${expected}**`],
  ["plugin/.codex-plugin/plugin.json", `"version": "${expected}"`],
  ["plugin/.claude-plugin/plugin.json", `"version": "${expected}"`],
]
for (const [file, needle] of exactSources) {
  if (!readFileSync(file, "utf8").includes(needle)) fail(`${file} does not advertise ${expected}`)
}

const changelog = readFileSync("CHANGELOG.md", "utf8")
const escapedVersion = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
if (!new RegExp(`^## \\[${escapedVersion}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m").test(changelog)) {
  fail(`CHANGELOG.md has no dated ${expected} release entry`)
}

console.log(`release version ${expected}: consistent`)

function fail(message) {
  console.error(`release version check failed: ${message}`)
  process.exit(1)
}
