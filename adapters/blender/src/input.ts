/**
 * Input translation for the bridge call. The gateway already validated the input against
 * the action's inputSchema, but this adapter re-checks what it actually uses: defence in
 * depth is the whole point of the local allowlist (docs/03 "Defense in depth").
 */
import { GatewayError } from "@cg/core"
import { toRelativeExportName } from "./paths"
import { EXPORT_FORMATS } from "./schema-parts"

export function asPayload(input: unknown): Record<string, unknown> {
  if (input === undefined || input === null) return {}
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new GatewayError("INVALID_INPUT", "Blender action input must be an object.")
  }
  return input as Record<string, unknown>
}

/**
 * `fileName` is re-validated and reduced to a root-relative name here; the bridge then
 * re-resolves it against its own export root, so neither side trusts the other.
 */
export function exportBody(payload: Record<string, unknown>, exportRoot: string): Record<string, unknown> {
  const fileName = payload["fileName"]
  const format = payload["format"]
  if (typeof fileName !== "string") {
    throw new GatewayError("INVALID_INPUT", "An export needs a file name.")
  }
  if (typeof format !== "string" || !(EXPORT_FORMATS as readonly string[]).includes(format)) {
    throw new GatewayError("INVALID_INPUT", "That export format is not supported.")
  }

  const body: Record<string, unknown> = {
    fileName: toRelativeExportName(exportRoot, fileName),
    format,
  }
  if (typeof payload["selectedOnly"] === "boolean") body["selectedOnly"] = payload["selectedOnly"]
  return body
}
