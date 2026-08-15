/**
 * Agents announce namespaced capabilities (`blender:scene.render`).
 * Grouping by namespace turns a flat list into "which adapters this machine has".
 */
import type { CapabilityGroup } from "../types"
import { readString } from "./guards"

const NAMESPACE_SEPARATOR = ":"

export function splitCapability(value: string): { connector: string | null; capability: string } {
  const index = value.indexOf(NAMESPACE_SEPARATOR)
  if (index <= 0 || index === value.length - 1) return { connector: null, capability: value }
  return { connector: value.slice(0, index), capability: value.slice(index + 1) }
}

/** Groups by namespace, de-duplicates, sorts namespaces first and unnamespaced last. */
export function groupCapabilities(capabilities: unknown): CapabilityGroup[] {
  if (!Array.isArray(capabilities)) return []

  const groups = new Map<string, Set<string>>()
  for (const entry of capabilities) {
    const text = readString(entry)
    if (text === undefined) continue
    const { connector, capability } = splitCapability(text)
    const key = connector ?? ""
    const bucket = groups.get(key) ?? new Set<string>()
    bucket.add(capability)
    groups.set(key, bucket)
  }

  return [...groups.entries()]
    .map(([key, values]) => ({
      connector: key === "" ? null : key,
      capabilities: [...values].sort(),
    }))
    .sort((a, b) => {
      if (a.connector === b.connector) return 0
      if (a.connector === null) return 1
      if (b.connector === null) return -1
      return a.connector.localeCompare(b.connector)
    })
}

export function countCapabilities(groups: readonly CapabilityGroup[]): number {
  return groups.reduce((total, group) => total + group.capabilities.length, 0)
}
