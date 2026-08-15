/**
 * Catalog -> MCP tool descriptors.
 *
 * Annotations are mapped FAITHFULLY from the manifest (docs/09: "Never fake a
 * read-only annotation to bypass host confirmation UX"). There is no path here
 * that can widen `readOnly` or narrow `destructive`.
 */
import type { ActionDefinition } from "@cg/core"
import type { CatalogEntry } from "@cg/registry"
import { toolNameFor } from "./tool-names"
import type { ToolTarget } from "./tool-names"

export type McpTool = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: {
    title: string
    readOnlyHint: boolean
    destructiveHint: boolean
    idempotentHint: boolean
    openWorldHint: boolean
  }
}

function toTool(connectorName: string, action: ActionDefinition): McpTool {
  return {
    name: toolNameFor(action.id),
    title: action.title,
    description: action.description,
    inputSchema: action.inputSchema as Record<string, unknown>,
    annotations: {
      title: `${connectorName}: ${action.title}`,
      readOnlyHint: action.annotations.readOnly,
      destructiveHint: action.annotations.destructive,
      idempotentHint: action.annotations.idempotent === true,
      // Every connector talks to a system outside this process.
      openWorldHint: true,
    },
  }
}

export function toolsFor(entries: readonly CatalogEntry[]): McpTool[] {
  return entries.flatMap((entry) =>
    entry.actions.map((action) => toTool(entry.connector.name, action)),
  )
}

export function targetsFor(entries: readonly CatalogEntry[]): ToolTarget[] {
  return entries.flatMap((entry) =>
    entry.actions.map((action) => ({ connectorId: entry.connector.id, actionId: action.id })),
  )
}
