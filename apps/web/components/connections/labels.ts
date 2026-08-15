/**
 * Every user-visible string on the Connections screen.
 *
 * The seal copy is the load-bearing part of this file. The value this form
 * stores is AES-256-GCM ciphertext, and only the gateway holds
 * CREDENTIAL_ENCRYPTION_KEY — so the sealing step happens on the server, by
 * hand, and a raw token pasted here would be stored as an unusable credential.
 * The page has to say that where someone about to paste will read it.
 */
import type { AuthType } from "@cg/core"

import type { ErrorCopy } from "@/components/convex-error"
import type { FieldIssue } from "./validate"

/**
 * Auth-type vocabulary → human copy. Keyed by @cg/core's `AuthType`, so a new
 * member of the protocol union fails to compile here instead of rendering a
 * raw protocol constant in a select.
 */
export const AUTH_TYPE_LABELS: Readonly<Record<AuthType, string>> = Object.freeze({
  bearer: "Bearer token",
  api_key: "API key",
  oauth2: "OAuth 2 access token",
  device: "Device credential",
  custom: "Custom scheme",
  none: "No credential",
})

/** What almost every HTTP connector wants, and what `seal` is usually fed. */
export const DEFAULT_AUTH_TYPE: AuthType = "bearer"

/** The command the operator runs on the gateway host. */
export const SEAL_COMMAND = "bun run --cwd apps/gateway seal"

export const CONNECTIONS_COPY = {
  formTitle: "Add a connection",
  formDescription:
    "A connection is one cloud service the gateway may call as you. Until one exists, every cloud action fails with CONNECTION_MISSING.",

  connector: {
    label: "Connector",
    placeholder: "careerpack",
    hint: "The connector id as the gateway registers it — lower case, no spaces.",
    listHint: "Type an id, or pick one you have connected before.",
  },
  baseUrl: {
    label: "Base URL",
    placeholder: "https://api.example.com",
    hint: "The https address the gateway calls. It is reached from the server, not from your browser.",
  },
  authType: {
    label: "Auth type",
    hint: "How the upstream service expects the credential to be presented.",
  },
  token: {
    label: "Sealed token",
    placeholder: "v1.xxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxx",
    hint: "Ciphertext only. Never paste a raw API token here.",
  },
  submit: "Save connection",
  pending: "Saving…",
  success: "Connection saved.",

  seal: {
    title: "Where the sealed value comes from",
    body: "The encryption key exists only in the gateway process — this dashboard cannot seal anything, and the database stores ciphertext it cannot open. So the operator seals the upstream token on the gateway host and pastes the result here. The command reads the token from stdin (paste it, then Enter and Ctrl-D) and prints one line beginning with v1. — that line is what belongs in the field below:",
    commandLabel: "Run on the gateway host",
    warning:
      "Paste the RAW token here instead and it is stored exactly as typed. Nothing fails now: the connection saves, looks active, and then every call through it fails later, when the gateway cannot open the credential.",
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
      "Add one with the form above. The credential is sealed on the gateway before it is stored, and is never shown here or handed to an AI client.",
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
 * Field problem → the sentence shown under that field. Exhaustive over
 * `FieldIssue`: a new issue that has no copy is a type error, never a blank.
 */
export const FIELD_ISSUE_COPY: Readonly<Record<FieldIssue, string>> = Object.freeze({
  connector_empty: "Name the connector this connection is for.",
  connector_shape:
    "A connector id is letters, digits, dashes and underscores only — for example careerpack.",
  url_empty: "Enter the base URL the gateway should call.",
  url_invalid: "That is not a URL. Include the scheme, like https://api.example.com.",
  url_scheme: "Use https. Plain http would put the upstream token on the wire in clear.",
  url_credentials:
    "Take the username and password out of the URL. Credentials belong in the sealed token, which is encrypted; a URL is not.",
  url_unreachable:
    "That host is not reachable from the gateway — it is a loopback, private or link-local address that only exists on your own network. Use the public https address of the service.",
  url_port:
    "Use the standard https port. The gateway calls port 443, or 8443 where a service uses the alternate — an arbitrary port is refused.",
  url_self:
    "That address belongs to this deployment. A connection may not point back at the gateway or its control plane.",
  token_empty: "Paste the sealed token.",
  token_not_sealed: `That does not look like a sealed value. Sealed tokens start with "v1." and are produced by \`${SEAL_COMMAND}\` on the gateway host — a raw token pasted here would be stored as a credential the gateway can never open.`,
})

/**
 * ConvexError code → copy, for the failures only the server can detect. The
 * message a server sends is never rendered (it can name internal state), so
 * every code needs a sentence of its own here.
 */
export const CONNECTIONS_ERROR_COPY: ErrorCopy = Object.freeze({
  fallback: "Something went wrong. Try again.",
  NOT_AUTHENTICATED: "Your session expired. Sign in again to continue.",
  NOT_AUTHORIZED: "That connection does not belong to this account.",
  INVALID_INPUT:
    "The gateway rejected those details. Check the base URL is a public https address and that the token is the sealed value, not the raw one.",
  CONNECTOR_NOT_FOUND: "The gateway does not know a connector by that id.",
  CONNECTION_MISSING: "That connection no longer exists. Reload the page.",
  RATE_LIMITED: "Too many changes just now. Wait a moment and try again.",
  UPSTREAM_ERROR: "The gateway could not reach that service.",
  TIMEOUT: "The request timed out. Try again.",
  INTERNAL: "Something went wrong. Try again.",
})
