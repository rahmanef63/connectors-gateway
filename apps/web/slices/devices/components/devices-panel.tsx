"use client"

import { useMemo } from "react"
import { usePreloadedQuery, useQuery } from "convex/react"
import type { Preloaded } from "convex/react"
import { devicesFunctions } from "../config/functions"
import { DEFAULT_DEVICES_LABELS } from "../config/labels"
import { toDeviceViews } from "../lib/device-view"
import type { TimestampFormatOptions } from "../lib/format"
import { mergeLabels } from "../lib/labels"
import type { LabelOverride } from "../lib/labels"
import type { DevicesLabels } from "../types"
import { DeviceList } from "./device-list"

export type PreloadedDeviceList = Preloaded<typeof devicesFunctions.listMine>

export type DevicesPanelProps = {
  /** First paint from a server component. Omit to query on the client. */
  preloaded?: PreloadedDeviceList
  labels?: LabelOverride<DevicesLabels>
  dateFormat?: TimestampFormatOptions
}

type ContentProps = {
  labels: DevicesLabels
  dateFormat: TimestampFormatOptions | undefined
}

function PreloadedContent({ preloaded, labels, dateFormat }: ContentProps & { preloaded: PreloadedDeviceList }) {
  const data = usePreloadedQuery(preloaded)
  return <DeviceList devices={toDeviceViews(data)} labels={labels} dateFormat={dateFormat} />
}

function LiveContent({ labels, dateFormat }: ContentProps) {
  const data = useQuery(devicesFunctions.listMine, {})
  if (data === undefined) return <p className="text-sm text-muted-foreground">{labels.loading}</p>
  return <DeviceList devices={toDeviceViews(data)} labels={labels} dateFormat={dateFormat} />
}

/**
 * Paired machines and their state. Reactive either way: the preloaded branch
 * hydrates from the server render and then keeps subscribing.
 */
export function DevicesPanel({ preloaded, labels, dateFormat }: DevicesPanelProps) {
  const copy = useMemo(() => mergeLabels(DEFAULT_DEVICES_LABELS, labels), [labels])

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{copy.panelTitle}</h2>
        <p className="text-sm text-muted-foreground">{copy.panelDescription}</p>
      </header>
      {preloaded === undefined ? (
        <LiveContent labels={copy} dateFormat={dateFormat} />
      ) : (
        <PreloadedContent preloaded={preloaded} labels={copy} dateFormat={dateFormat} />
      )}
    </section>
  )
}
