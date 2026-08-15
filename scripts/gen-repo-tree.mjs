#!/usr/bin/env node
/**
 * Regenerates REPO-TREE.txt from the real, tracked tree so the map cannot rot.
 * Run: bun scripts/gen-repo-tree.mjs
 */
import { execSync } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"

const IGNORE = new Set(["bun.lock", "REPO-TREE.txt"])

const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((file) => !IGNORE.has(file) && existsSync(file))

/** top-level entry -> (second-level child -> file count, or null for a plain file) */
const roots = new Map()
for (const file of files) {
  const [top, second] = file.split("/")
  if (second === undefined) {
    roots.set(top, null)
    continue
  }
  if (!roots.has(top)) roots.set(top, new Map())
  const children = roots.get(top)
  const isLeafFile = file.split("/").length === 2
  children.set(second, isLeafFile ? null : (children.get(second) ?? 0) + 1)
}

const lines = []
for (const name of [...roots.keys()].sort()) {
  const children = roots.get(name)
  if (children === null) {
    lines.push(name)
    continue
  }
  lines.push(`${name}/`)
  for (const child of [...children.keys()].sort()) {
    const count = children.get(child)
    lines.push(count === null ? `  ${child}` : `  ${child}/  (${count} files)`)
  }
}

const header = [
  "Map of the repository, generated from the tracked tree.",
  "Regenerate with:  bun scripts/gen-repo-tree.mjs",
  "Directories deeper than two levels are collapsed to a file count.",
  "",
  `${files.length} files total.`,
  "",
  "",
].join("\n")

writeFileSync("REPO-TREE.txt", header + lines.join("\n") + "\n")
console.log(`REPO-TREE.txt — ${files.length} files, ${lines.length} lines`)
