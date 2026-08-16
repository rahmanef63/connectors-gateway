"use client"

import { EmptyState } from "@/components/empty-state"
import type { CatalogEntry } from "@/lib/catalog"

import { ConnectorCard } from "./connector-card"
import { CATALOG_COPY } from "./labels"

export type ConnectorGridProps = {
  entries: readonly CatalogEntry[]
  /** Connector ids this account already has a credential for. */
  connectedIds: readonly string[]
  onConnect?: (connectorId: string) => void
}

export function ConnectorGrid({ entries, connectedIds, onConnect }: ConnectorGridProps) {
  if (entries.length === 0) {
    return (
      <EmptyState title={CATALOG_COPY.emptyTitle} description={CATALOG_COPY.emptyDescription} />
    )
  }

  const connected = new Set(connectedIds)

  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {entries.map((entry) => (
        <ConnectorCard
          key={entry.id}
          entry={entry}
          connected={connected.has(entry.id)}
          onConnect={onConnect}
        />
      ))}
    </ul>
  )
}
