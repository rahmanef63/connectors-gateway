/**
 * Catalog -> MCP tool descriptors.
 *
 * Annotations are mapped FAITHFULLY from the manifest (docs/09: "Never fake a
 * read-only annotation to bypass host confirmation UX"). There is no path here
 * that can widen `readOnly` or narrow `destructive`.
 */
import type { ActionDefinition } from "@cg/core"
import type { CatalogEntry } from "@cg/registry"
import { assertNoToolNameCollision, toolNameFor } from "./tool-names"
import type { ToolTarget } from "./tool-names"

export type McpSecurityScheme = { type: "oauth2"; scopes: string[] }

export type McpTool = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  securitySchemes: McpSecurityScheme[]
  annotations: {
    title: string
    readOnlyHint: boolean
    destructiveHint: boolean
    idempotentHint: boolean
    openWorldHint: boolean
  }
  _meta: {
    securitySchemes: McpSecurityScheme[]
    "openai/toolInvocation/invoking": string
    "openai/toolInvocation/invoked": string
  }
}

const FALLBACK_OUTPUT_SCHEMA: Readonly<Record<string, unknown>> = Object.freeze({
  type: "object",
  additionalProperties: true,
})

function statusText(prefix: string, title: string, suffix = ""): string {
  const room = Math.max(0, 64 - prefix.length - suffix.length)
  return `${prefix}${title.slice(0, room)}${suffix}`
}

function modelDescription(connectorName: string, action: ActionDefinition): string {
  if (/^use this when\b/i.test(action.description)) return action.description
  return `Use this when the user's request requires the “${action.title}” operation in ${connectorName}. ${action.description}`
}

function toTool(connectorName: string, action: ActionDefinition): McpTool {
  const securitySchemes: McpSecurityScheme[] = [
    { type: "oauth2", scopes: [...(action.requiredScopes ?? [])] },
  ]
  return {
    name: toolNameFor(action.id),
    title: action.title,
    description: modelDescription(connectorName, action),
    inputSchema: action.inputSchema as Record<string, unknown>,
    outputSchema: (action.outputSchema ?? FALLBACK_OUTPUT_SCHEMA) as Record<string, unknown>,
    securitySchemes,
    annotations: {
      title: `${connectorName}: ${action.title}`,
      readOnlyHint: action.annotations.readOnly,
      destructiveHint: action.annotations.destructive,
      idempotentHint: action.annotations.idempotent === true,
      // Every connector talks to a system outside this process.
      openWorldHint: true,
    },
    _meta: {
      // Mirrored for clients that still read the compatibility location.
      securitySchemes,
      "openai/toolInvocation/invoking": statusText("Running ", action.title, "…"),
      "openai/toolInvocation/invoked": statusText("Completed ", action.title),
    },
  }
}

function actionIdsOf(entries: readonly CatalogEntry[]): string[] {
  return entries.flatMap((entry) => entry.actions.map((action) => action.id))
}

/** A catalog whose tools would collide is not listed at all — see docs/09. */
export function toolsFor(entries: readonly CatalogEntry[]): McpTool[] {
  assertNoToolNameCollision(actionIdsOf(entries))
  return entries
    .flatMap((entry) => entry.actions.map((action) => toTool(entry.connector.name, action)))
    .sort((left, right) => left.name.localeCompare(right.name))
}

export function targetsFor(entries: readonly CatalogEntry[]): ToolTarget[] {
  return entries.flatMap((entry) =>
    entry.actions.map((action) => ({ connectorId: entry.connector.id, actionId: action.id })),
  )
}
