import type { Metadata } from "next"
import { preloadQuery } from "convex/nextjs"

import { api } from "@convex/_generated/api"
import { DevicesPanel } from "@/features/devices"
import { PageHeader } from "@/components/app-shell/page-header"
import { navItemFor } from "@/components/app-shell/nav-items"
import { convexOptions } from "@/lib/convex-server"

export const metadata: Metadata = { title: "Devices" }

export default async function DevicesPage() {
  const preloaded = await preloadQuery(
    api.features.devices.queries.listMine,
    {},
    await convexOptions(),
  )

  return (
    <>
      <PageHeader title="Devices" description={navItemFor("/devices")?.description ?? ""} />
      {/* The shell owns the page title, so the slice's own heading is retitled
          rather than repeated. */}
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
