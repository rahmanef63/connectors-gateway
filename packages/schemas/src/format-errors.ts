/**
 * Turn Ajv errors into a message that is safe to hand back to an AI client.
 *
 * The offending value is NEVER echoed: an invalid action input may contain an
 * API key, a bearer token, or an absolute local path (AGENTS.md invariants 5/12).
 * Only the JSON pointer into the instance and the failing keyword are reported.
 */
import type { ErrorObject } from "ajv/dist/2020"

/** Beyond this the message stops being useful and starts being a payload. */
const MAX_REPORTED = 10

function describe(error: ErrorObject): string {
  const pointer = error.instancePath === "" ? "/" : error.instancePath
  if (error.keyword === "required") {
    // `missingProperty` is schema-defined, not instance-supplied, so naming it leaks nothing.
    const missing: unknown = error.params?.["missingProperty"]
    if (typeof missing === "string") return `${pointer} required:${missing}`
  }
  return `${pointer} ${error.keyword}`
}

export function safeErrorMessage(
  prefix: string,
  errors: readonly ErrorObject[] | null | undefined,
): string {
  if (!errors || errors.length === 0) return `${prefix}.`

  const seen: string[] = []
  for (const error of errors) {
    const described = describe(error)
    if (!seen.includes(described)) seen.push(described)
    if (seen.length === MAX_REPORTED) break
  }

  const more = errors.length > seen.length ? ` (+${errors.length - seen.length} more)` : ""
  return `${prefix}: ${seen.join("; ")}${more}`
}
