"use client"

import { usePreloadedQuery, type Preloaded } from "convex/react"

import {
  ConnectionForm,
  ConnectionList,
  CONNECTIONS_COPY,
  connectionFunctions,
} from "@/components/connections"
import { SectionCard } from "@/components/section-card"

export type PreloadedConnections = Preloaded<typeof connectionFunctions.listMine>

/**
 * The connections screen: add one, see the ones you have, remove one.
 *
 * The query returns summaries only — the sealed upstream token never leaves
 * Convex, so nothing rendered here could leak into a screenshot. The form sends
 * ciphertext in the other direction, produced on the gateway host; this browser
 * never holds the encryption key and could not seal anything if it wanted to.
 */
export function ConnectionsView({ preloaded }: { preloaded: PreloadedConnections }) {
  const connections = usePreloadedQuery(preloaded)

  return (
    <div className="space-y-5">
      <SectionCard
        title={CONNECTIONS_COPY.formTitle}
        description={CONNECTIONS_COPY.formDescription}
      >
        <ConnectionForm
          knownConnectorIds={connections.map((connection) => connection.connectorId)}
        />
      </SectionCard>

      <ConnectionList connections={connections} />
    </div>
  )
}
