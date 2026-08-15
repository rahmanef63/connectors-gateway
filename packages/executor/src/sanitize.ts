/**
 * Result scrubbing — docs/14 "result contains sensitive local path".
 * A local adapter naturally knows `/home/u/renders/out.png`; the AI client
 * must only ever see `out.png` plus a gateway-controlled ref.
 *
 * TODO(rr): duplicated from @cg/observability/paths. packages/executor declares
 * only @cg/core + @cg/protocol and package manifests are owned by the spine, so
 * @cg/observability does not resolve here. Delete this file and import it once
 * the dependency exists.
 */
import type { ResultFile } from "@cg/core"

const POSIX_PATH = /(^|[\s"'`([=:,])(\/(?:[^\s/\\:*?"'`<>|]+\/)+[^\s/\\:*?"'`<>|]*)/g
const WINDOWS_PATH = /(^|[\s"'`([=,])([A-Za-z]:\\(?:[^\s\\/:*?"'`<>|]+\\)*[^\s\\/:*?"'`<>|]*)/g

export function basename(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean)
  return segments.at(-1) ?? path
}

export function stripPaths(value: string): string {
  return value
    .replace(POSIX_PATH, (_match, lead: string, path: string) => lead + basename(path))
    .replace(WINDOWS_PATH, (_match, lead: string, path: string) => lead + basename(path))
}

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
