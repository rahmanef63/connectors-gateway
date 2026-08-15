import type { ReactNode } from "react"

import type { ConnectionStatus, DeviceStatus, PolicyDecision } from "@cg/core"
import { cn } from "@/lib/cn"

/**
 * THE tone SSOT for the whole app.
 *
 * Every status colour — badges, panels, toasts, slice components — resolves
 * through `TONE_CLASSES`. Nothing anywhere else may name a colour token for a
 * status, which is what stops two screens inventing two different greens.
 *
 * Only tokens from app/globals.css appear here; there is no hex in this file
 * and no Tailwind dark variant (the theme swap re-points the tokens).
 */

/**
 * The tone vocabulary. `Tone` is derived from this list, so adding a member
 * makes every `Record<Tone, …>` below fail to compile — a new tone can never
 * fall through to a default branch.
 */
export const TONES = ["success", "warning", "danger", "neutral"] as const

export type Tone = (typeof TONES)[number]

export type ToneClasses = {
  /** Text colour only — for a label, an inline icon or a bordered panel. */
  readonly text: string
  /** Border colour only — for a surface that keeps its own background. */
  readonly border: string
  /** The badge treatment: tinted background + border + text, all at once. */
  readonly pill: string
}

const tone = (text: string, border: string, tint: string): ToneClasses =>
  Object.freeze({ text, border, pill: `${tint} ${border} ${text}` })

/**
 * Lookup map, never an if-chain. The annotation is the exhaustiveness check:
 * a tone added to `TONES` and not to this map is a type error.
 */
export const TONE_CLASSES: Readonly<Record<Tone, ToneClasses>> = Object.freeze({
  success: tone("text-success", "border-success/25", "bg-success/12"),
  warning: tone("text-accent", "border-accent/30", "bg-accent/12"),
  danger: tone("text-destructive", "border-destructive/30", "bg-destructive/12"),
  neutral: tone("text-muted-foreground", "border-border", "bg-card-hover"),
})

/**
 * Resolve a runtime string (a status straight off a Convex row) against a tone
 * map. `Object.hasOwn` and not a bare index: `map["toString"]` on a plain
 * object resolves an inherited member and would badge a garbage status.
 */
export function toneFrom<Key extends string>(
  map: Readonly<Record<Key, Tone>>,
  key: string,
): Tone | undefined {
  return Object.hasOwn(map, key) ? map[key as Key] : undefined
}

/**
 * Domain vocabulary → tone. Keyed by the @cg/core unions, so a new status value
 * in the protocol fails to typecheck here instead of rendering blank.
 *
 * A slice that owns a vocabulary (devices, audit) keeps its own copy of the map
 * so it can be installed without the host; each one is pinned to the table below
 * by a test, so the two can never paint the same status differently.
 */
export const CONNECTION_STATUS_TONES: Readonly<Record<ConnectionStatus, Tone>> = Object.freeze({
  active: "success",
  expired: "warning",
  revoked: "danger",
  error: "danger",
})

export const DEVICE_STATUS_TONES: Readonly<Record<DeviceStatus, Tone>> = Object.freeze({
  online: "success",
  offline: "neutral",
  revoked: "danger",
})

export const POLICY_DECISION_TONES: Readonly<Record<PolicyDecision, Tone>> = Object.freeze({
  ALLOW: "success",
  REQUIRE_APPROVAL: "warning",
  DENY: "danger",
})

/** The pill itself. A slice with its own status vocabulary renders this. */
export function StatusBadge({
  tone: name,
  className,
  children,
}: {
  tone: Tone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[name].pill,
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * Connections is the one status vocabulary no slice owns, so the host renders
 * it. Devices and policy decisions are rendered by their slices, which carry
 * their own labels — a second badge here would be a second place to name them.
 *
 * An unrecognised value is shown as unknown rather than silently untoned.
 */
export function ConnectionStatusBadge({ status }: { status: string }) {
  const name = toneFrom(CONNECTION_STATUS_TONES, status)
  if (name === undefined) return <StatusBadge tone="neutral">Unknown</StatusBadge>
  return <StatusBadge tone={name}>{status}</StatusBadge>
}
