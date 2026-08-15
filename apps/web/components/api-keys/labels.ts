/**
 * Every user-visible string on the API-key surface, in one place.
 *
 * The reveal copy is deliberately blunt. A gateway API key is not a password
 * for this dashboard — it is the thing that lets an AI client act as the user
 * against every connector they have connected, so the page says that in those
 * words rather than "keep it safe".
 */
import type { ErrorCopy } from "@/components/convex-error"

export const API_KEYS_COPY = {
  sectionTitle: "API keys",
  sectionDescription:
    "A key is how an AI client proves it is you. Create one per client, and revoke it the moment that client is retired.",

  create: {
    label: "Key name",
    placeholder: "Claude Desktop — laptop",
    hint: "A name only you see. It is what you will look for when revoking.",
    submit: "Create API key",
    pending: "Creating…",
    invalid: "Give the key a name of 1–64 characters.",
    success: "API key created. Copy it now — it is shown once.",
    /** The key landed but the response did not carry a readable token. */
    unreadable:
      "The key was created but the gateway did not return a readable value. Revoke it below and create another.",
  },

  reveal: {
    title: "Copy this key now — it is shown once",
    body: "This is the only time the key is displayed. It is not stored anywhere you can read it back, and it cannot be recovered: if you lose it, revoke it and create another.",
    danger:
      "Anyone holding this key can act as you through the gateway — every connector you have connected, every device you have paired. Paste it into one AI client and nowhere else.",
    /** Explains why the config block below suddenly contains a real secret. */
    configNotice:
      "While this key is on screen the configuration blocks below carry it, ready to paste. Dismiss it and they go back to the placeholder.",
    field: "API key",
    dismiss: "I have copied it",
  },

  list: {
    caption: "API keys issued for this account",
    columnLabel: "Name",
    columnKey: "Key",
    columnStatus: "Status",
    columnCreated: "Created",
    columnLastUsed: "Last used",
    columnActions: "Actions",
    unnamed: "Unnamed key",
    emptyTitle: "No API keys yet",
    emptyDescription:
      "Create one above, then paste it into the AI client you want to connect. Until a key exists, the gateway rejects every call.",
    unavailableTitle: "Your keys could not be loaded",
    unavailableDescription:
      "Creating a key still works, and the new key is shown here as soon as it is made. Reload to try the list again.",
  },

  revoke: {
    action: "Revoke",
    title: "Revoke this key?",
    description:
      "The AI client using it stops working immediately, on its very next call. This cannot be undone — create a new key and paste that into the client instead.",
    confirm: "Revoke key",
    pending: "Revoking…",
    cancel: "Cancel",
    success: "API key revoked.",
  },
} as const

/**
 * ConvexError code → copy. Codes come from `convex/_shared/errors.ts`, whose
 * vocabulary is @cg/core's `ERROR_CODES`; anything outside it, and every plain
 * `Error`, resolves to `fallback` so a server message is never rendered.
 */
export const API_KEYS_ERROR_COPY: ErrorCopy = Object.freeze({
  fallback: "Something went wrong. Try again.",
  NOT_AUTHENTICATED: "Your session expired. Sign in again to continue.",
  NOT_AUTHORIZED: "That key does not belong to this account.",
  INVALID_INPUT: "That key name is not valid. Use 1–64 ordinary characters.",
  RATE_LIMITED: "Too many keys created just now. Wait a moment and try again.",
  TIMEOUT: "The request timed out. Try again.",
  INTERNAL: "Something went wrong. Try again.",
})
