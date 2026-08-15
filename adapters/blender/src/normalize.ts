/**
 * Bridge response -> model-visible output.
 *
 * The bridge is local and trusted-ish, but its answers still carry local filesystem detail.
 * docs/11: "Do not push arbitrary local filesystem paths into model-visible output."
 * File-producing actions are rebuilt from an allowlist; everything else is walked and scrubbed.
 */
import { ACTION_SCENE_RENDER, FILE_PRODUCING_ACTIONS } from "./action-ids"
import { looksLikePath, toSafeOutput } from "./paths"

const MAX_DEPTH = 6
const MAX_ARRAY_ITEMS = 500
const MAX_STRING_LENGTH = 4_096
const MIME_PATTERN = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/
/** Keys that carry filesystem detail by convention; dropped whatever their value is. */
const PATH_KEY = /(path|directory|dirname|folder|cwd|blendfile|filename)/i
const FALLBACK_MIME = "application/octet-stream"

export type NormalizedFile = { name: string; mimeType: string; sizeBytes: number }

export function normalizeOutput(actionId: string, raw: Record<string, unknown>): Record<string, unknown> {
  if (FILE_PRODUCING_ACTIONS.includes(actionId)) return fileOutput(actionId, raw)
  return stripPaths(raw, 0) as Record<string, unknown>
}

/**
 * Rebuilt field by field: only `file` (name/mimeType/sizeBytes) plus two scalars survive,
 * so a bridge that adds a `outputPath` field tomorrow still cannot leak it.
 */
function fileOutput(actionId: string, raw: Record<string, unknown>): Record<string, unknown> {
  const source = isRecord(raw["file"]) ? raw["file"] : raw
  const file: NormalizedFile = {
    name: toSafeOutput(firstString(source["name"], source["fileName"], source["path"]) ?? "output"),
    mimeType: mimeTypeOf(source["mimeType"]),
    sizeBytes: nonNegativeInt(source["sizeBytes"] ?? source["size"]),
  }
  const output: Record<string, unknown> = { file }
  if (actionId === ACTION_SCENE_RENDER) {
    const frame = raw["renderedFrame"] ?? raw["frame"]
    if (typeof frame === "number" && Number.isFinite(frame)) output["renderedFrame"] = Math.trunc(frame)
  }
  const duration = raw["durationMs"]
  if (typeof duration === "number" && Number.isFinite(duration)) output["durationMs"] = nonNegativeInt(duration)
  return output
}

function stripPaths(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return null
  if (typeof value === "string") {
    const trimmed = value.length > MAX_STRING_LENGTH ? value.slice(0, MAX_STRING_LENGTH) : value
    return looksLikePath(trimmed) ? toSafeOutput(trimmed) : trimmed
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map((item) => stripPaths(item, depth + 1))
  if (!isRecord(value)) return null

  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (PATH_KEY.test(key)) continue
    out[key] = stripPaths(entry, depth + 1)
  }
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function firstString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate
  }
  return undefined
}

function mimeTypeOf(value: unknown): string {
  if (typeof value !== "string") return FALLBACK_MIME
  const lowered = value.toLowerCase().split(";")[0]?.trim() ?? ""
  return MIME_PATTERN.test(lowered) ? lowered : FALLBACK_MIME
}

function nonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0
  return Math.trunc(value)
}
