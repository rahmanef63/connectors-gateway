#!/usr/bin/env node
/**
 * rr P1: every slice ships the metadata PAIR (slice.json + slice.manifest.json)
 * and both must agree on `version`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const SLICES_DIR = new URL("../apps/web/slices", import.meta.url).pathname

if (!existsSync(SLICES_DIR)) {
  console.log("audit:slices — no slices directory, nothing to check")
  process.exit(0)
}

const problems = []
const slices = readdirSync(SLICES_DIR).filter((entry) => statSync(join(SLICES_DIR, entry)).isDirectory())

for (const slug of slices) {
  const dir = join(SLICES_DIR, slug)
  const contractPath = join(dir, "slice.json")
  const manifestPath = join(dir, "slice.manifest.json")

  if (!existsSync(contractPath)) problems.push(`${slug}: missing slice.json`)
  if (!existsSync(manifestPath)) problems.push(`${slug}: missing slice.manifest.json`)
  if (!existsSync(contractPath) || !existsSync(manifestPath)) continue

  const contract = JSON.parse(readFileSync(contractPath, "utf8"))
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))

  if (contract.version !== manifest.version) {
    problems.push(`${slug}: version drift — slice.json ${contract.version} vs slice.manifest.json ${manifest.version}`)
  }
  if (!contract.contract) problems.push(`${slug}: slice.json has no "contract" block`)
  if (contract.name !== slug) problems.push(`${slug}: slice.json name "${contract.name}" does not match directory`)
}

if (problems.length === 0) {
  console.log(`audit:slices — OK (${slices.length} slice(s))`)
  process.exit(0)
}

console.error("audit:slices — problems:")
for (const problem of problems) console.error(`  ${problem}`)
process.exit(1)
