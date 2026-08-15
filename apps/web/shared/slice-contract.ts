/**
 * The seam between the app shell (this agent) and the feature slices in
 * `apps/web/slices/*` (imported as `@/features/<slug>`).
 *
 * Shell guarantees to a slice:
 *  - exactly ONE outer chrome exists and the shell owns it, so a slice renders
 *    no sidebar, header, page title or page-level container;
 *  - the slice is mounted inside `<main>`, already padded, already themed;
 *  - data is preloaded server-side and handed over as a `Preloaded` ref — the
 *    slice calls `usePreloadedQuery`, never `useEffect` + fetch;
 *  - colours come from app/globals.css tokens only.
 *
 * Slice guarantees back: a default-exported (or named) client component taking
 * exactly `SliceMountProps`, plus any slice-owned mutations it needs.
 */
import type { Preloaded } from "convex/react"
import type { FunctionReference } from "convex/server"

export type SliceMountProps<Query extends FunctionReference<"query">> = {
  preloaded: Preloaded<Query>
}
