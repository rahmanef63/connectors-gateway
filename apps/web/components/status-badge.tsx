import type { ComponentProps } from "react"

import { Badge } from "@/components/ui/badge"

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>

// Maps, not objects: a bare index would resolve inherited keys like "toString".
const CONNECTION_VARIANTS = new Map<string, BadgeVariant>([
  ["active", "success"],
  ["expired", "warning"],
  ["revoked", "destructive"],
  ["error", "destructive"],
])

const DEVICE_VARIANTS = new Map<string, BadgeVariant>([
  ["online", "success"],
  ["offline", "secondary"],
  ["revoked", "destructive"],
])

const DECISION_VARIANTS = new Map<string, BadgeVariant>([
  ["ALLOW", "success"],
  ["REQUIRE_APPROVAL", "warning"],
  ["DENY", "destructive"],
])

const DECISION_LABELS = new Map<string, string>([
  ["ALLOW", "Allow"],
  ["REQUIRE_APPROVAL", "Require approval"],
  ["DENY", "Deny"],
])

function UnknownBadge() {
  return <Badge variant="outline">Unknown</Badge>
}

export function ConnectionStatusBadge({ status }: { status: string }) {
  const variant = CONNECTION_VARIANTS.get(status)
  if (variant === undefined) return <UnknownBadge />
  return <Badge variant={variant}>{status}</Badge>
}

export function DeviceStatusBadge({ status }: { status: string }) {
  const variant = DEVICE_VARIANTS.get(status)
  if (variant === undefined) return <UnknownBadge />
  return <Badge variant={variant}>{status}</Badge>
}

export function PolicyDecisionBadge({ decision }: { decision: string }) {
  const variant = DECISION_VARIANTS.get(decision)
  if (variant === undefined) return <UnknownBadge />
  return <Badge variant={variant}>{DECISION_LABELS.get(decision) ?? decision}</Badge>
}
