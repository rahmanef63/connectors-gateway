"use client"

import { useRef, useState } from "react"
import { usePreloadedQuery, type Preloaded } from "convex/react"

import { ConnectorGrid, CATALOG_COPY } from "@/components/catalog"
import { ConnectPanel, CONNECTIONS_COPY, connectionFunctions, type ConnectErrorCode } from "@/components/connections"
import { ConnectionList } from "@/components/connections"
import { SectionCard } from "@/components/section-card"
import type { CatalogEntry } from "@/lib/catalog"
import { startOAuthConnect, saveTokenConnection } from "./actions"

export type PreloadedConnections = Preloaded<typeof connectionFunctions.listMine>

export type ConnectNotice =
  | { kind: "connected"; name: string }
  | { kind: "error"; code: ConnectErrorCode }
  | null

/**
 * The connections screen: browse what can be connected, connect one, see the
 * ones you have, remove one.
 *
 * The query returns summaries only — the sealed upstream token never leaves
 * Convex, so nothing rendered here could leak into a screenshot. In the other
 * direction this browser sends no credential at all any more: the OAuth flow
 * hands the token to the server directly, and a pasted one goes to a Server
 * Action that seals it before Convex ever sees it.
 *
 * `catalog` arrives from the server component: it is derived from the shipped
 * manifests, which pull in ajv, so it must not be imported into a client bundle.
 */
export function ConnectionsView({
  preloaded,
  catalog,
  redirectUri,
  notice,
}: {
  preloaded: PreloadedConnections
  catalog: readonly CatalogEntry[]
  redirectUri: string
  notice: ConnectNotice
}) {
  const connections = usePreloadedQuery(preloaded)
  const [connectTarget, setConnectTarget] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const connectedIds = connections.map((connection) => connection.connectorId)
  const target = catalog.find((entry) => entry.id === connectTarget) ?? null

  function startConnect(connectorId: string) {
    setConnectTarget(connectorId)
    // The panel is below the grid; on a phone it is well off-screen.
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div className="space-y-6">
      <SectionCard title={CATALOG_COPY.title} description={CATALOG_COPY.description}>
        <ConnectorGrid entries={catalog} connectedIds={connectedIds} onConnect={startConnect} />
      </SectionCard>

      <div ref={panelRef}>
        <SectionCard
          title={CONNECTIONS_COPY.formTitle}
          description={CONNECTIONS_COPY.formDescription}
        >
          {/* Remounting on a new target clears both forms — a half-typed
              credential for one connector must not carry into another. */}
          <ConnectPanel
            key={connectTarget ?? "blank"}
            connectorId={target?.id ?? null}
            connectorName={target?.name ?? null}
            redirectUri={redirectUri}
            // A catalog entry with no endpoint is one the manifest cannot
            // locate — the user supplies the address along with the key.
            needsEndpoint={target !== null && target.endpoint === null}
            credentialFields={target?.credentialFields ?? []}
            notice={notice}
            startOAuth={startOAuthConnect}
            saveToken={saveTokenConnection}
          />
        </SectionCard>
      </div>

      <ConnectionList connections={connections} />
    </div>
  )
}
