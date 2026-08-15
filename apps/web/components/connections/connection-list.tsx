"use client"

import { EmptyState } from "@/components/empty-state"
import { ConnectionStatusBadge } from "@/components/status-badge"
import { CONNECTIONS_COPY } from "./labels"
import { RemoveConnectionDialog } from "./remove-connection-dialog"

/** Exactly the `connectionSummaryValidator` shape — no ciphertext, no owner. */
export type ConnectionRow = {
  connectionId: string
  connectorId: string
  authType: string
  status: string
  baseUrl: string
}

/**
 * Native `<table>` on tokens — no UI-kit primitives. The sealed upstream token
 * is not in the row shape, so there is nothing here a screenshot could leak.
 *
 * Metrics match components/table-skeleton.tsx (same `.card` surface, same cell
 * padding, same row rule), so when the data lands nothing on the page moves.
 */
export function ConnectionList({ connections }: { connections: readonly ConnectionRow[] }) {
  if (connections.length === 0) {
    return (
      <EmptyState
        title={CONNECTIONS_COPY.list.emptyTitle}
        description={CONNECTIONS_COPY.list.emptyDescription}
      />
    )
  }

  return (
    <div className="card overflow-hidden">
      {/* Scrolls itself rather than pushing the page sideways on a phone. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{CONNECTIONS_COPY.list.caption}</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">
                {CONNECTIONS_COPY.list.columnConnector}
              </th>
              <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">
                {CONNECTIONS_COPY.list.columnEndpoint}
              </th>
              <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">
                {CONNECTIONS_COPY.list.columnAuth}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {CONNECTIONS_COPY.list.columnStatus}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                <span className="sr-only">{CONNECTIONS_COPY.list.columnActions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {connections.map((connection) => (
              <tr key={connection.connectionId} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-4 py-3.5 text-left font-medium">
                  {connection.connectorId}
                </th>
                <td className="hidden max-w-[16rem] truncate px-4 py-3.5 font-mono text-xs text-muted-foreground md:table-cell">
                  {connection.baseUrl}
                </td>
                <td className="hidden px-4 py-3.5 text-muted-foreground lg:table-cell">
                  {connection.authType}
                </td>
                <td className="px-4 py-3.5">
                  <ConnectionStatusBadge status={connection.status} />
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex justify-end">
                    <RemoveConnectionDialog connection={connection} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
