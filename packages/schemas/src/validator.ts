/**
 * The one Ajv instance for the whole process.
 *
 * A second instance would mean a second meta-schema registry and duplicated
 * compilation work; a per-call instance would recompile every action schema on
 * every request. Compiled validators are cached by schema *identity* (WeakMap),
 * so a manifest object that is loaded once is compiled once.
 */
import Ajv from "ajv/dist/2020"
import type { ErrorObject, ValidateFunction } from "ajv/dist/2020"
import { GatewayError } from "@cg/core"
import type { JsonSchema } from "@cg/core"
import { safeErrorMessage } from "./format-errors"

const ajv = new Ajv({
  // Manifests carry annotation keywords Ajv does not know (title/description on
  // arbitrary subschemas). Unknown keywords must not hard-fail the gateway.
  strict: false,
  // The caller gets one aggregated message instead of one error per round trip.
  allErrors: true,
})

const compiled = new WeakMap<object, ValidateFunction>()

function compileFresh(schema: JsonSchema): ValidateFunction {
  const id = schema["$id"]
  if (typeof id === "string") {
    // A distinct object carrying an already-registered $id would make Ajv throw.
    const existing = ajv.getSchema(id)
    if (existing) return existing
  }
  return ajv.compile(schema)
}

/**
 * Compile (or reuse) a validator for `schema`.
 * Throws INVALID_INPUT if the schema itself is not a valid JSON Schema —
 * the reason is deliberately not echoed, since a schema may be attacker-shaped.
 */
export function compileSchema(schema: JsonSchema): ValidateFunction {
  const cachedValidator = compiled.get(schema)
  if (cachedValidator) return cachedValidator

  let validate: ValidateFunction
  try {
    validate = compileFresh(schema)
  } catch {
    throw new GatewayError("INVALID_INPUT", "Schema is not a valid JSON Schema document.")
  }

  compiled.set(schema, validate)
  return validate
}

/**
 * Validate `value` against `schema`, throwing INVALID_INPUT with an aggregated,
 * value-free message. `label` prefixes the message, e.g. "Invalid job envelope".
 */
export function validateOrThrow(schema: JsonSchema, value: unknown, label: string): void {
  const validate = compileSchema(schema)
  if (validate(value)) return

  const errors: readonly ErrorObject[] | null | undefined = validate.errors
  throw new GatewayError("INVALID_INPUT", safeErrorMessage(label, errors))
}
