import { Skeleton } from "@/components/skeleton"

/**
 * Loading shape for the data routes — the `loading.tsx` of every table screen.
 *
 * It renders the SAME shell the real tables render — the `.card` surface, the
 * native `<table>`, the same cell padding and row rule — so when the data
 * arrives the only thing that changes is the text inside the cells. No layout
 * jump, no reflow of the page below it.
 *
 * It draws the table ONLY. The eyebrow/title block is rendered by AppShell in
 * app/(app)/layout.tsx, which a route's `loading.tsx` never replaces — a header
 * stand-in here would paint a second one under the real one and then vanish
 * when the rows land.
 *
 * The whole drawing is decorative: one `role="status"` wrapper carries the
 * announcement, everything inside is `aria-hidden`.
 */

/** Cycled per column so the row reads like text, not like a progress bar.
 *  Deterministic on purpose — a random width would mismatch on hydration. */
const CELL_WIDTHS = ["w-32", "w-24", "w-40", "w-20"] as const

const widthAt = (index: number) => CELL_WIDTHS[index % CELL_WIDTHS.length]

const range = (length: number) => Array.from({ length }, (_, index) => index)

export function TableSkeleton({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden className="card overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              {range(cols).map((col) => (
                <th key={col} className="px-4 py-3 text-left font-medium">
                  <Skeleton className="h-3.5 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {range(rows).map((row) => (
              <tr key={row} className="border-b border-border last:border-b-0">
                {range(cols).map((col) => (
                  <td key={col} className="px-4 py-3.5">
                    <Skeleton className={`h-4 ${widthAt(row + col)} max-w-full`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
