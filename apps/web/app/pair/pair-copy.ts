/**
 * Copy for every terminal state of /pair. Each outcome is distinct on purpose:
 * "expired", "already claimed" and "unknown code" are three different facts and
 * a visitor granting a machine local execution rights deserves to know which
 * one happened.
 *
 * Tone comes from THE tone SSOT (components/status-badge.tsx) — this file names
 * no colour. The icon name is checked against the shell's icon set, so a typo
 * cannot ship a blank glyph.
 */
import type { IconName } from "@/components/shell/icons"
import type { Tone } from "@/components/status-badge"
import type { PairingViewState } from "@/lib/pairing-state"

/** The category line above every title. The tone, not the words, carries state. */
export const PAIR_EYEBROW = "Device pairing"

export type PairCopy = {
  title: string
  body: string
  tone: Tone
  icon: IconName
}

const COPY: Readonly<Record<PairingViewState, PairCopy>> = Object.freeze({
  missing_code: {
    title: "No pairing code",
    body: "This link has no code in it, or the code was mistyped. Start the Connectors Agent on the machine you want to pair and open the link it prints.",
    tone: "warning",
    icon: "search",
  },
  unknown: {
    title: "Unknown pairing code",
    body: "No pending pairing request matches this code. Codes are single-use, so a link that was already opened and finished will land here too. Generate a new code from the agent.",
    tone: "warning",
    icon: "search",
  },
  expired: {
    title: "Pairing code expired",
    body: "Pairing codes are deliberately short-lived. Nothing was approved. Restart the pairing request on the machine to get a fresh code.",
    tone: "warning",
    icon: "clock",
  },
  claimed: {
    title: "Already paired",
    body: "This code was already used and the machine has its credential. If you did not do this, revoke the device from the Devices screen — revoking ends its session immediately.",
    tone: "danger",
    icon: "shield",
  },
  approved: {
    title: "Approved",
    body: "Waiting for the machine to collect its credential. You can close this page; the device will appear on the Devices screen once it connects.",
    tone: "success",
    icon: "check",
  },
  ready: {
    title: "Approve this machine?",
    body: "Only approve if you started this pairing yourself, on this machine, just now.",
    tone: "neutral",
    icon: "laptop",
  },
})

/** A state outside the union (a stale build, a hand-edited URL) never renders blank. */
const FALLBACK: PairCopy = Object.freeze({
  title: "Pairing unavailable",
  body: "This pairing request cannot be shown. Start a new one from the agent.",
  tone: "warning",
  icon: "search",
})

export function pairCopy(state: PairingViewState): PairCopy {
  return Object.hasOwn(COPY, state) ? COPY[state] : FALLBACK
}
