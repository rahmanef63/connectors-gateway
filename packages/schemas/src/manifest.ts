/**
 * Connector manifest validation — the Phase 0 contract gate (docs/13).
 * A manifest that does not validate must not be allowed to boot a connector.
 */
import { GatewayError } from "@cg/core"
import type { ConnectorManifest, JsonSchema } from "@cg/core"
import { connectorManifestSchema } from "./schemas"
import { compileSchema, validateOrThrow } from "./validator"

const LABEL = "Invalid connector manifest"

/**
 * Every action's `inputSchema` must itself compile. Without this an action would
 * pass manifest validation and then fail at call time — i.e. an unvalidated
 * input would reach an adapter, which is exactly what the contract forbids.
 */
function assertActionSchemasCompile(manifest: ConnectorManifest): void {
  manifest.actions.forEach((action, index) => {
    try {
      compileSchema(action.inputSchema)
      const output: JsonSchema | undefined = action.outputSchema
      if (output) compileSchema(output)
    } catch {
      throw new GatewayError("INVALID_INPUT", `${LABEL}: /actions/${index} schema-not-compilable`)
    }
  })
}

/** Validate an untrusted value as a ConnectorManifest, or throw INVALID_INPUT. */
export function validateManifest(value: unknown): ConnectorManifest {
  validateOrThrow(connectorManifestSchema, value, LABEL)

  const manifest = value as ConnectorManifest
  assertActionSchemasCompile(manifest)
  return manifest
}
