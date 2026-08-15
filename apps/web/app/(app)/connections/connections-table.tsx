"use client"

import { usePreloadedQuery, type Preloaded } from "convex/react"

import type { api } from "@convex/_generated/api"
import { EmptyState } from "@/components/empty-state"
import { ConnectionStatusBadge } from "@/components/status-badge"

/**
 * Native `<table>` on tokens — no UI-kit primitives. The metrics deliberately
 * match components/table-skeleton.tsx (same `.card` surface, same cell padding,
 * same row rule), so when the data lands nothing on the page moves.
 */
export function ConnectionsTable({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.features.connections.queries.listMine>
}) {
  // The query returns summaries only — the sealed upstream token never leaves
  // Convex, so there is nothing here that could leak into a screenshot.
  const connections = usePreloadedQuery(preloaded)

  if (connections.length === 0) {
    return (
      <EmptyState
        title="No cloud connections yet"
        description="A connection appears once you authorise a cloud connector. Its credential is sealed by the gateway and is never shown here, or to an AI client."
      />
    )
  }

  return (
    <div className="card overflow-hidden">
      {/* Scrolls itself rather than pushing the page sideways on a phone. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Cloud connections this account has authorised</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">
                Connector
              </th>
              <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">
                Endpoint
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Auth
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Status
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
                <td className="px-4 py-3.5 text-muted-foreground">{connection.authType}</td>
                <td className="px-4 py-3.5">
                  <div className="flex justify-end">
                    <ConnectionStatusBadge status={connection.status} />
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
