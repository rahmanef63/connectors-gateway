/**
 * What an approval is FOR.
 *
 * The hash covers the connector, the action and the arguments, so approving
 * "delete issue 5" cannot be replayed as "delete issue 500". An approval keyed
 * on the action alone would be a standing grant wearing a confirmation
 * screen's clothes — which is the failure docs/16 names as the worst kind of
 * gap: a screen that claims mediated risk and delivers none.
 *
 * Input is canonicalised first: two calls that differ only in key order are
 * the same call, and would otherwise each need their own approval.
 */
import { createHash } from "node:crypto"

const MAX_PREVIEW = 300

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    )
  }
  return value
}

export function approvalHash(connectorId: string, actionId: string, input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify({ c: connectorId, a: actionId, i: canonical(input) }))
    .digest("hex")
}

/**
 * A short echo of the arguments for the approval screen.
 *
 * Truncated hard, because this text is written by a model and rendered to a
 * human who is about to authorise something on its say-so. It exists to make
 * two pending rows tellable apart, not to be a faithful payload view.
 */
export function inputPreview(input: unknown): string {
  let text: string
  try {
    text = JSON.stringify(canonical(input) ?? {})
  } catch {
    return "(arguments could not be displayed)"
  }
  return text.length > MAX_PREVIEW ? `${text.slice(0, MAX_PREVIEW - 1)}…` : text
}
