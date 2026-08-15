/** Copy for every terminal state of /pair. Each outcome is distinct on purpose. */
import type { PairingViewState } from "@/lib/pairing-state"

export type PairCopy = {
  title: string
  body: string
  tone: "neutral" | "warning" | "danger" | "success"
}

const COPY = new Map<PairingViewState, PairCopy>([
  [
    "missing_code",
    {
      title: "No pairing code",
      body: "This link has no code in it, or the code was mistyped. Start the Connectors Agent on the machine you want to pair and open the link it prints.",
      tone: "warning",
    },
  ],
  [
    "unknown",
    {
      title: "Unknown pairing code",
      body: "No pending pairing request matches this code. Codes are single-use, so a link that was already opened and finished will land here too. Generate a new code from the agent.",
      tone: "warning",
    },
  ],
  [
    "expired",
    {
      title: "Pairing code expired",
      body: "Pairing codes are deliberately short-lived. Nothing was approved. Restart the pairing request on the machine to get a fresh code.",
      tone: "warning",
    },
  ],
  [
    "claimed",
    {
      title: "Already paired",
      body: "This code was already used and the machine has its credential. If you did not do this, revoke the device from the Devices screen — revoking ends its session immediately.",
      tone: "danger",
    },
  ],
  [
    "approved",
    {
      title: "Approved",
      body: "Waiting for the machine to collect its credential. You can close this page; the device will appear on the Devices screen once it connects.",
      tone: "success",
    },
  ],
  [
    "ready",
    {
      title: "Approve this machine?",
      body: "Only approve if you started this pairing yourself, on this machine, just now.",
      tone: "neutral",
    },
  ],
])

export function pairCopy(state: PairingViewState): PairCopy {
  return (
    COPY.get(state) ?? {
      title: "Pairing unavailable",
      body: "This pairing request cannot be shown. Start a new one from the agent.",
      tone: "warning",
    }
  )
}
