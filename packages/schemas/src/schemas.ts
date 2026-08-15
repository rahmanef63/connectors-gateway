/**
 * The frozen wire contracts, as raw JSON Schema documents.
 *
 * Exported so other packages validate against the *same object identity* the
 * validator cache is keyed on — importing the .json file again elsewhere would
 * compile a second copy.
 */
import type { JsonSchema } from "@cg/core"
import connectorManifest from "../connector-manifest.schema.json"
import jobEnvelope from "../job-envelope.schema.json"
import agentResult from "../agent-result.schema.json"
import deviceCapability from "../device-capability.schema.json"

export const connectorManifestSchema: JsonSchema = connectorManifest
export const jobEnvelopeSchema: JsonSchema = jobEnvelope
export const agentResultSchema: JsonSchema = agentResult
export const deviceCapabilitySchema: JsonSchema = deviceCapability

export const SCHEMAS = Object.freeze({
  connectorManifest: connectorManifestSchema,
  jobEnvelope: jobEnvelopeSchema,
  agentResult: agentResultSchema,
  deviceCapability: deviceCapabilitySchema,
})
