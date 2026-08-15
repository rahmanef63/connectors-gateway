#!/usr/bin/env node
/**
 * rr P2: no source file over 200 lines.
 * Exclusions mirror the rr doctrine: generated code, vendored shadcn primitives,
 * pure data exports, and tests.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const LIMIT = 200
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "_generated", "out"])
const EXCLUDE = [
  /\/components\/ui\//,
  /\/lib\/content\//,
  /\.test\.[cm]?tsx?$/,
  /\/__tests__\//,
  /seed\.ts$/,
  /\.d\.ts$/,
]
const INCLUDE = /\.(ts|tsx|mjs|js|jsx)$/

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (INCLUDE.test(entry)) out.push(full)
  }
  return out
}

const offenders = []
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file)
  if (EXCLUDE.some((pattern) => pattern.test("/" + rel))) continue
  const lines = readFileSync(file, "utf8").split("\n").length
  if (lines > LIMIT) offenders.push({ rel, lines })
}

if (offenders.length === 0) {
  console.log(`audit:file-size — OK (limit ${LIMIT})`)
  process.exit(0)
}

console.error(`audit:file-size — ${offenders.length} file(s) over ${LIMIT} lines:`)
for (const { rel, lines } of offenders.sort((a, b) => b.lines - a.lines)) {
  console.error(`  ${lines.toString().padStart(4)}  ${rel}`)
}
process.exit(1)
