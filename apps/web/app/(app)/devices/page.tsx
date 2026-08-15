import type { Metadata } from "next"
import { preloadQuery } from "convex/nextjs"

import { api } from "@convex/_generated/api"
import { DevicesPanel } from "@/features/devices"
import { convexOptions } from "@/lib/convex-server"
import { navTitleFor } from "@/components/shell/nav-items"

export const metadata: Metadata = { title: navTitleFor("/devices") }

export default async function DevicesPage() {
  const preloaded = await preloadQuery(
    api.features.devices.queries.listMine,
    {},
    await convexOptions(),
  )

  return (
    <>
      {/* The shell renders the page title from the nav registry, so the slice's
          own heading is retitled rather than repeated. */}
      <DevicesPanel
        preloaded={preloaded}
        labels={{
          panelTitle: "Paired machines",
          panelDescription: "Each machine keeps its own credential and connects outbound only.",
        }}
      />
      <p className="mt-6 text-sm text-muted-foreground">
        A machine appears here after you approve its pairing code. Pairing always starts on the
        machine, in the Connectors Agent — this dashboard never issues a credential to an AI client.
      </p>
    </>
  )
}
