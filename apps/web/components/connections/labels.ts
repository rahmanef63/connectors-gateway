/**
 * Every user-visible string on the Connections screen.
 *
 * The screen used to ask for four things: a connector id, a base URL, an auth
 * type, and AES-GCM ciphertext the user had to produce by running a CLI on the
 * gateway host. Three of those are properties of the connector — the manifest
 * knows them — and the fourth is now sealed server-side. What is left to ask is
 * at most a client id and a client secret, and for a server that registers
 * clients on demand, nothing at all.
 */
import type { AuthType } from "@cg/core"

import type { ErrorCopy } from "@/components/convex-error"

/**
 * Auth-type vocabulary → human copy. Keyed by @cg/core's `AuthType`, so a new
 * member of the protocol union fails to compile here instead of rendering a
 * raw protocol constant.
 */
export const AUTH_TYPE_LABELS: Readonly<Record<AuthType, string>> = Object.freeze({
  bearer: "Bearer token",
  api_key: "API key",
  oauth2: "OAuth 2 access token",
  device: "Device credential",
  custom: "Custom scheme",
  none: "No credential",
})

/** What almost every HTTP connector wants. */
export const DEFAULT_AUTH_TYPE: AuthType = "bearer"

export const CONNECTIONS_COPY = {
  formTitle: "Add a connection",
  formDescription:
    "A connection is one cloud service the gateway may call as you. Until one exists, every cloud action fails with CONNECTION_MISSING.",

  connect: {
    idle: "Pick a connector above to connect it.",
    heading: (name: string) => `Connect ${name}`,
    lead: "You will be sent to the service to approve access. The token it issues comes straight back here, is encrypted before it is stored, and is never shown again — not to you, and not to an AI client.",
    submit: "Connect",
    pending: "Starting…",

    byoTitle: "Use your own OAuth app",
    byoHint:
      "Most services want you to create an app in their developer console and bring its two values back here. Leave both empty and the gateway will register itself, which only works where the service allows it.",
    clientId: "Client ID",
    clientSecret: "Client secret",
    clientSecretHint: "Leave empty for a public client — the service will say if it needs one.",
    redirectLabel: "Redirect URL to register with the service",

    tokenTitle: "Paste a token instead",
    tokenHint:
      "For a service that issues you a long-lived token directly. It is encrypted on this server before it is stored.",
    tokenLabel: "Access token",
    tokenSubmit: "Save token",
    tokenPending: "Saving…",
    tokenSuccess: "Connection saved.",

    connected: (name: string) => `${name} is connected.`,
  },

  list: {
    caption: "Cloud connections this account has authorised",
    columnConnector: "Connector",
    columnEndpoint: "Endpoint",
    columnAuth: "Auth",
    columnStatus: "Status",
    columnActions: "Actions",
    emptyTitle: "No cloud connections yet",
    emptyDescription:
      "Connect one from the catalog above. The credential is encrypted before it is stored, and is never shown here or handed to an AI client.",
  },

  remove: {
    action: "Remove",
    title: "Remove this connection?",
    description:
      "The gateway loses the stored credential for this connector, and every cloud action for it fails until you add it again. The upstream service is not told, and the token itself is not revoked there — revoke it at the source too if it is no longer wanted.",
    confirm: "Remove connection",
    pending: "Removing…",
    cancel: "Cancel",
    success: "Connection removed.",
  },
} as const

/**
 * Everything that can stop a connect attempt. The server actions and the OAuth
 * callback return one of these codes and never a third party's error text — a
 * message from an authorization server can name internal state, and it is
 * attacker-influenced input on a page we render.
 */
export type ConnectErrorCode =
  | "not_signed_in"
  | "sealing_unavailable"
  | "unknown_connector"
  | "client_id_required"
  | "discovery_failed"
  | "registration_failed"
  | "start_failed"
  | "secret_required"
  | "save_failed"
  | "flow_expired"
  | "consent_denied"
  | "state_mismatch"
  | "exchange_failed"

export const CONNECT_ERRORS: Readonly<Record<ConnectErrorCode, string>> = Object.freeze({
  not_signed_in: "Your session expired. Sign in again and retry.",
  sealing_unavailable:
    "This deployment cannot store credentials: CREDENTIAL_ENCRYPTION_KEY is not set on the dashboard. Nothing was saved.",
  unknown_connector: "This build does not ship a cloud connector by that name.",
  client_id_required:
    "That service does not register clients automatically. Create an app in its developer console and paste the client ID and secret below.",
  discovery_failed:
    "Could not work out how to sign in to that service — it did not publish OAuth metadata we could follow. Use a token instead if it issues you one.",
  registration_failed: "The service refused to register this gateway as a client.",
  start_failed: "Could not start the connection. Try again.",
  secret_required: "Paste the token first.",
  save_failed: "The connection could not be saved. Try again.",
  flow_expired: "That took too long. Start the connection again.",
  consent_denied: "Access was not granted, so nothing was connected.",
  state_mismatch: "That response did not match the connection you started. Nothing was saved.",
  exchange_failed:
    "The service would not exchange the approval for a token. Check the client ID and secret, then try again.",
})

/**
 * ConvexError code → copy, for the failures only the control plane can detect.
 * The message a server sends is never rendered (it can name internal state), so
 * every code needs a sentence of its own here.
 */
export const CONNECTIONS_ERROR_COPY: ErrorCopy = Object.freeze({
  fallback: "Something went wrong. Try again.",
  NOT_AUTHENTICATED: "Your session expired. Sign in again to continue.",
  NOT_AUTHORIZED: "That connection does not belong to this account.",
  INVALID_INPUT: "The gateway rejected those details.",
  CONNECTOR_NOT_FOUND: "The gateway does not know a connector by that id.",
  CONNECTION_MISSING: "That connection no longer exists. Reload the page.",
  RATE_LIMITED: "Too many changes just now. Wait a moment and try again.",
  UPSTREAM_ERROR: "The gateway could not reach that service.",
  TIMEOUT: "The request timed out. Try again.",
  INTERNAL: "Something went wrong. Try again.",
})
