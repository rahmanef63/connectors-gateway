/**
 * The Convex-throwing wrapper around the shared redirect-URI rule.
 *
 * The rule itself is in `@cg/core` because the gateway needs it too — it checks
 * a registration up front so it can answer RFC 7591's `invalid_redirect_uri`
 * rather than a 500, since `ControlPlaneClient` deliberately flattens every
 * control-plane failure into one opaque `UPSTREAM_ERROR`.
 *
 * This file exists only to turn a `false` into the ConvexError the rest of the
 * control plane speaks. THIS is the check that counts: the gateway's is a
 * courtesy to the caller, and the write path must never depend on it.
 */
import { REDIRECT_URI_MESSAGE, isValidRedirectUri } from "@cg/core"
import { fail } from "./errors"

export { isRegisteredRedirectUri, isValidRedirectUri } from "@cg/core"

export function assertRedirectUri(value: unknown): string {
  if (!isValidRedirectUri(value)) fail("INVALID_INPUT", REDIRECT_URI_MESSAGE)
  return value
}
