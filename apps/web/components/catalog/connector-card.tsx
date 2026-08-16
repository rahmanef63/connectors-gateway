"use client"

import Link from "next/link"

import { Icon, type IconName } from "@/components/shell/icons"
import { StatusBadge } from "@/components/status-badge"
import type { CatalogEntry } from "@/lib/catalog"
import { cn } from "@/lib/cn"

import { AUTH_LABEL, CATALOG_COPY, EXECUTOR_LABEL, EXECUTOR_TONE, RISK_TONE, authLabel } from "./labels"

/** Connector id → glyph. Unknown ids fall back rather than breaking the grid. */
const ICON_FOR: Readonly<Record<string, IconName>> = {
  careerpack: "doc",
  blender: "laptop",
}

function iconFor(id: string): IconName {
  return Object.hasOwn(ICON_FOR, id) ? (ICON_FOR[id] as IconName) : "plug"
}

export type ConnectorCardProps = {
  entry: CatalogEntry
  connected: boolean
  /** Cloud connectors only — opens the credential form for this connector. */
  onConnect?: (connectorId: string) => void
}

export function ConnectorCard({ entry, connected, onConnect }: ConnectorCardProps) {
  const isLocal = entry.executor === "local"

  return (
    <li className="card flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
            connected ? "bg-accent/12 text-accent" : "bg-card-hover text-muted-foreground",
          )}
        >
          <Icon name={iconFor(entry.id)} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{entry.name}</p>
          {/* The auth label is dropped for local connectors: "Paired device"
              only repeats the badge beside it, and the extra clause is what
              pushed this line into an ellipsis. */}
          <p className="truncate text-xs text-muted-foreground">
            v{entry.version} · {CATALOG_COPY.actions(entry.actionCount)}
            {isLocal ? "" : ` · ${authLabel(entry.authType)}`}
          </p>
        </div>
        <StatusBadge tone={EXECUTOR_TONE[entry.executor]}>
          {EXECUTOR_LABEL[entry.executor]}
        </StatusBadge>
      </div>

      <ul className="flex flex-col gap-1">
        {entry.sampleActions.map((action) => (
          <li key={action} className="truncate font-mono text-xs text-muted-foreground">
            {action}
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        <StatusBadge tone={RISK_TONE[entry.topRisk]}>{entry.topRisk}</StatusBadge>{" "}
        {CATALOG_COPY.riskNote(entry.topRisk)}
      </p>

      {isLocal ? <LocalFooter /> : <CloudFooter entry={entry} connected={connected} onConnect={onConnect} />}
    </li>
  )
}

/**
 * The answer to "how do I expose localhost to a public IP": you do not.
 * The agent dials out, so the machine never accepts an inbound connection
 * (docs/03, AGENTS.md invariant 2). Saying it on the card is the only place a
 * user will actually read it.
 */
function LocalFooter() {
  return (
    <div className="mt-auto rounded-xl border border-border bg-card-hover/40 p-3">
      <p className="text-xs font-medium">{CATALOG_COPY.localTitle}</p>
      <p className="mt-1 text-xs text-muted-foreground">{CATALOG_COPY.localBody}</p>
      <Link href="/devices" className="btn-ghost mt-3 w-full text-xs">
        {CATALOG_COPY.localAction}
      </Link>
    </div>
  )
}

function CloudFooter({
  entry,
  connected,
  onConnect,
}: {
  entry: CatalogEntry
  connected: boolean
  onConnect?: (connectorId: string) => void
}) {
  return (
    <div className="mt-auto flex items-center justify-between gap-3">
      <StatusBadge tone={connected ? "success" : "neutral"}>
        {connected ? CATALOG_COPY.connected : CATALOG_COPY.notConnected}
      </StatusBadge>
      <button
        type="button"
        onClick={() => onConnect?.(entry.id)}
        className={connected ? "btn-ghost text-xs" : "btn-primary text-xs"}
      >
        {connected ? CATALOG_COPY.reconnect : CATALOG_COPY.connect}
      </button>
    </div>
  )
}
