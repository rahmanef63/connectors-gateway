/**
 * Result scrubbing — docs/14 "result contains sensitive local path".
 * A local adapter naturally knows `/home/u/renders/out.png`; the AI client
 * must only ever see `out.png` plus a gateway-controlled ref.
 */
import type { ResultFile } from "@cg/core"
import { basename, stripPaths } from "@cg/observability"

/** Normalize file metadata before it can reach a client. */
export function sanitizeFile(file: ResultFile): ResultFile {
  const out: ResultFile = {
    name: basename(file.name),
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    ref: stripPaths(file.ref),
  }
  if (file.expiresAt !== undefined) out.expiresAt = file.expiresAt
  return out
}
