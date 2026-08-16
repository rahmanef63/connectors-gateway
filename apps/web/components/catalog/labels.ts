import type { CatalogEntry } from "@/lib/catalog"
import type { Tone } from "@/components/status-badge"

/** Every user-visible string on the catalog cards, in one place. */
export const CATALOG_COPY = {
  title: "Apps you can connect",
  description:
    "Each card is a connector this gateway can run. Connecting one stores a credential for your account only — an AI client never sees it.",
  connect: "Connect",
  reconnect: "Reconnect",
  connected: "Connected",
  notConnected: "Not connected",
  actions: (count: number) => `${count} action${count === 1 ? "" : "s"}`,
  cloudBadge: "Cloud",
  localBadge: "Your machine",
  emptyTitle: "No connectors in this build",
  emptyDescription:
    "A connector is a manifest this gateway ships. Add one under adapters/remote-mcp/connectors/.",
  localTitle: "Runs on your machine",
  localBody:
    "This one does not need a public IP, a port forward or a tunnel. Pair the machine and it dials out to the gateway itself — the gateway never opens a connection towards you.",
  localAction: "Pair a machine",
  riskNote: (risk: string) =>
    risk === "R0" || risk === "R1"
      ? "Read-only and low-risk actions run without approval."
      : "Some actions here need approval before they run.",
} as const

/** Executor → how the card labels it. A lookup, so a new executor cannot fall through. */
export const EXECUTOR_LABEL: Readonly<Record<CatalogEntry["executor"], string>> = {
  cloud: CATALOG_COPY.cloudBadge,
  local: CATALOG_COPY.localBadge,
}

export const EXECUTOR_TONE: Readonly<Record<CatalogEntry["executor"], Tone>> = {
  cloud: "neutral",
  local: "warning",
}

/** Highest risk in the manifest → the tone of the card's risk line. */
export const RISK_TONE: Readonly<Record<CatalogEntry["topRisk"], Tone>> = {
  R0: "success",
  R1: "success",
  R2: "warning",
  R3: "warning",
  R4: "danger",
}

export const AUTH_LABEL: Readonly<Record<string, string>> = {
  none: "No credential",
  oauth2: "OAuth",
  api_key: "API key",
  bearer: "Bearer token",
  device: "Paired device",
  custom: "Custom",
}

export function authLabel(authType: string): string {
  return Object.hasOwn(AUTH_LABEL, authType) ? (AUTH_LABEL[authType] as string) : authType
}
