/**
 * Action input validation — the last gate before an adapter sees AI-supplied data.
 * Runs on every call, including local jobs (docs/06-connector-contract.md).
 */
import type { JsonSchema } from "@cg/core"
import { validateOrThrow } from "./validator"

/**
 * Validate AI-supplied `input` against an action's `inputSchema`.
 * Returns the same value on success; throws INVALID_INPUT with a message that
 * never contains the input (it may carry a secret the model was handed).
 */
export function validateActionInput(schema: JsonSchema, input: unknown): unknown {
  validateOrThrow(schema, input, "Invalid action input")
  return input
}
