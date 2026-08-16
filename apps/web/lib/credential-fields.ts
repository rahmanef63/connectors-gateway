/**
 * Reading back exactly what a connector's manifest asked for.
 *
 * Its own module, and free of `server-only`, for two reasons: this is pure
 * logic worth testing directly, and the connect action that uses it lives
 * behind the credential sealer, which must never be importable from a test or
 * a client bundle.
 */
import type { CredentialField } from "@cg/core"
import { manifestFor } from "@/lib/catalog"

export type CollectedCredential = {
  /** Sealed as-is. A bare string for one field, JSON for several. */
  secret: string
  /** The upstream address, when a field declared itself to be one. */
  endpoint: string | null
  /** Field name that was required and blank; `__endpoint__` for an address. */
  missing: string | null
}

function read(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Read back exactly what the connector's manifest asked for.
 *
 * Returns the credential as a JSON object when the manifest declares more than
 * one credential field, and as the bare string when it declares one — so the
 * historical single-secret connections keep the shape they already have at
 * rest, and only a multi-field connector pays for the envelope.
 *
 * A field marked `role: "endpoint"` is the upstream address, not a credential:
 * it is pulled out here so it never ends up sealed inside the token blob,
 * where the executor could not read it and nobody would think to look.
 */
export function collectCredential(
  connectorId: string,
  formData: FormData,
): CollectedCredential {
  const manifest = manifestFor(connectorId)
  const declared: readonly CredentialField[] = manifest?.auth.fields ?? []

  if (declared.length === 0) {
    const secret = read(formData, "secret")
    const endpoint = read(formData, "endpoint")
    return {
      secret,
      endpoint: endpoint.length > 0 ? endpoint : null,
      missing: secret.length === 0 ? "secret" : null,
    }
  }

  let endpoint: string | null = null
  const credential: Record<string, string> = {}
  for (const spec of declared) {
    const value = read(formData, spec.name)
    const required = spec.required !== false
    if (value.length === 0) {
      // An optional field left blank is not a failure; a required one is, and
      // an endpoint reports itself distinctly so the message can say so.
      if (required) return { secret: "", endpoint: null, missing: spec.role === "endpoint" ? "__endpoint__" : spec.name }
      continue
    }
    if (spec.role === "endpoint") endpoint = value
    else credential[spec.name] = value
  }

  const keys = Object.keys(credential)
  if (keys.length === 0) {
    return { secret: "", endpoint, missing: "secret" }
  }
  const secret =
    keys.length === 1 && keys[0] !== undefined
      ? (credential[keys[0]] as string)
      : JSON.stringify(credential)
  return { secret, endpoint, missing: null }
}
