"use client"

import { useRef, useState } from "react"
import { usePreloadedQuery, type Preloaded } from "convex/react"

import { ConnectorGrid, CATALOG_COPY } from "@/components/catalog"
import {
  ConnectionForm,
  ConnectionList,
  CONNECTIONS_COPY,
  connectionFunctions,
} from "@/components/connections"
import { SectionCard } from "@/components/section-card"
import type { CatalogEntry } from "@/lib/catalog"

export type PreloadedConnections = Preloaded<typeof connectionFunctions.listMine>

/**
 * The connections screen: browse what can be connected, connect one, see the
 * ones you have, remove one.
 *
 * The query returns summaries only — the sealed upstream token never leaves
 * Convex, so nothing rendered here could leak into a screenshot. The form sends
 * ciphertext in the other direction, produced on the gateway host; this browser
 * never holds the encryption key and could not seal anything if it wanted to.
 *
 * `catalog` arrives from the server component: it is derived from the shipped
 * manifests, which pull in ajv, so it must not be imported into a client bundle.
 */
export function ConnectionsView({
  preloaded,
  catalog,
}: {
  preloaded: PreloadedConnections
  catalog: readonly CatalogEntry[]
}) {
  const connections = usePreloadedQuery(preloaded)
  const [connectTarget, setConnectTarget] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const connectedIds = connections.map((connection) => connection.connectorId)

  function startConnect(connectorId: string) {
    setConnectTarget(connectorId)
    // The form is below the grid; on a phone it is well off-screen.
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div className="space-y-6">
      <SectionCard title={CATALOG_COPY.title} description={CATALOG_COPY.description}>
        <ConnectorGrid entries={catalog} connectedIds={connectedIds} onConnect={startConnect} />
      </SectionCard>

      <div ref={formRef}>
        <SectionCard
          title={CONNECTIONS_COPY.formTitle}
          description={CONNECTIONS_COPY.formDescription}
        >
          {/* Remounting on a new target resets every field — a half-typed
              credential for one connector must not carry into another. */}
          <ConnectionForm
            key={connectTarget ?? "blank"}
            initialConnectorId={connectTarget ?? ""}
            knownConnectorIds={catalog.map((entry) => entry.id)}
          />
        </SectionCard>
      </div>

      <ConnectionList connections={connections} />
    </div>
  )
}
