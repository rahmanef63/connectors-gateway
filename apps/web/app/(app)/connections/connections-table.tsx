"use client"

import { usePreloadedQuery, type Preloaded } from "convex/react"

import type { api } from "@convex/_generated/api"
import { EmptyState } from "@/components/empty-state"
import { ConnectionStatusBadge } from "@/components/status-badge"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Connector</TableHead>
            <TableHead className="hidden md:table-cell">Endpoint</TableHead>
            <TableHead>Auth</TableHead>
            <TableHead className="pr-4 text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {connections.map((connection) => (
            <TableRow key={connection.connectionId}>
              <TableCell className="pl-4 font-medium">{connection.connectorId}</TableCell>
              <TableCell className="hidden max-w-[16rem] truncate font-mono text-xs text-muted-foreground md:table-cell">
                {connection.baseUrl}
              </TableCell>
              <TableCell className="text-muted-foreground">{connection.authType}</TableCell>
              <TableCell className="pr-4 text-right">
                <ConnectionStatusBadge status={connection.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
