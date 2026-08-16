"use server"

/**
 * The two ways a connection gets created, both of them server-side.
 *
 * OAUTH (the button): the user clicks Connect, this discovers the connector's
 * authorization server, obtains a client id — registering one automatically if
 * the server offers RFC 7591 — and sends the browser to the consent screen.
 * Nothing is stored until the code comes back to /oauth/callback.
 *
 * TOKEN (the fallback): the user pastes a credential the upstream issued them,
 * and it is sealed HERE before it is stored. That replaced a form asking for a
 * base URL, an auth type, and ciphertext the user had to produce by SSHing to
 * the gateway host and running a CLI. Three of those four inputs were already
 * known from the connector's manifest, and the fourth was the reason nobody but
 * the operator could connect anything.
 *
 * P0: every action re-verifies the caller against Convex with their own session
 * token. `connectorId` is only ever used to look up a shipped manifest, so a
 * hand-crafted id resolves to nothing rather than to a host of the caller's
 * choosing.
 */
import { redirect } from "next/navigation"
import type { AuthType } from "@cg/core"
import { fetchMutation, fetchQuery } from "convex/nextjs"
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server"

import { api } from "@convex/_generated/api"
import { manifestFor } from "@/lib/catalog"
import { oauthRedirectUri } from "@/lib/app-origin"
import { sealCredential, sealingAvailable } from "@/lib/credentials"
import {
  authorizeUrl,
  createPkce,
  createState,
  discoverAuthServer,
  registerClient,
  writeFlowState,
} from "@/lib/oauth"
import type { ConnectErrorCode } from "@/components/connections/labels"

// A "use server" module may export nothing but async functions, so the idle
// state and the copy live in `components/connections/labels.ts` instead.
export type ConnectFormState = { readonly error: ConnectErrorCode | null }

const fail = (error: ConnectErrorCode): ConnectFormState => ({ error })

/** The caller's identity, proven by Convex rather than assumed from a cookie. */
async function requireViewerToken(): Promise<string | null> {
  const token = await convexAuthNextjsToken()
  if (token === undefined || token.length === 0) return null
  try {
    await fetchQuery(api.features.auth.queries.viewer, {}, { token })
    return token
  } catch {
    return null
  }
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === "string" ? value.trim() : ""
}

type Connectable = { readonly id: string; readonly endpoint: string; readonly authType: AuthType }

/** A cloud connector this build ships, with an address to talk to. */
function connectable(connectorId: string): Connectable | null {
  const manifest = manifestFor(connectorId)
  if (manifest === null || manifest.executor !== "cloud") return null
  if (typeof manifest.endpoint !== "string" || manifest.endpoint.length === 0) return null
  return { id: manifest.id, endpoint: manifest.endpoint, authType: manifest.auth.type }
}

export async function startOAuthConnect(
  _previous: ConnectFormState,
  formData: FormData,
): Promise<ConnectFormState> {
  const token = await requireViewerToken()
  if (token === null) return fail("not_signed_in")
  if (!sealingAvailable()) return fail("sealing_unavailable")

  const target = connectable(field(formData, "connectorId"))
  if (target === null) return fail("unknown_connector")

  const clientIdInput = field(formData, "clientId")
  const clientSecretInput = field(formData, "clientSecret")

  let destination: string
  try {
    const server = await discoverAuthServer(target.endpoint)

    let clientId = clientIdInput
    let clientSecret: string | null = clientSecretInput.length > 0 ? clientSecretInput : null
    if (clientId.length === 0) {
      // Nothing typed: only a server that registers clients on demand can be
      // connected with zero fields. Otherwise the user has to create an app in
      // that vendor's console and bring its id and secret back here.
      if (server.registrationEndpoint === null) return fail("client_id_required")
      const registered = await registerClient(
        server.registrationEndpoint,
        oauthRedirectUri(),
        "Connectors Gateway",
      )
      clientId = registered.clientId
      clientSecret = registered.clientSecret ?? clientSecret
    }

    const { verifier, challenge } = await createPkce()
    const state = createState()
    await writeFlowState({
      connectorId: target.id,
      state,
      verifier,
      clientId,
      clientSecret,
      tokenEndpoint: server.tokenEndpoint,
      redirectUri: oauthRedirectUri(),
      resource: server.resource,
    })

    destination = authorizeUrl({
      authorizationEndpoint: server.authorizationEndpoint,
      clientId,
      redirectUri: oauthRedirectUri(),
      challenge,
      state,
      scope: server.scope,
      resource: server.resource,
    })
  } catch (error) {
    return fail(classify(error))
  }

  // Outside the try: redirect() signals by throwing, and catching it here would
  // turn a successful start into an error message.
  redirect(destination)
}

export async function saveTokenConnection(
  _previous: ConnectFormState,
  formData: FormData,
): Promise<ConnectFormState> {
  const token = await requireViewerToken()
  if (token === null) return fail("not_signed_in")
  if (!sealingAvailable()) return fail("sealing_unavailable")

  const target = connectable(field(formData, "connectorId"))
  if (target === null) return fail("unknown_connector")

  const secret = field(formData, "secret")
  if (secret.length === 0) return fail("secret_required")

  try {
    await fetchMutation(
      api.features.connections.mutations.upsert,
      {
        connectorId: target.id,
        baseUrl: target.endpoint,
        tokenCipher: await sealCredential(secret),
        authType: target.authType,
      },
      { token },
    )
  } catch {
    return fail("save_failed")
  }
  return { error: null }
}

/** Never surfaces a third party's error text — only a code this app owns. */
function classify(error: unknown): ConnectErrorCode {
  const name = error instanceof Error ? error.name : ""
  if (name === "DiscoveryError") return "discovery_failed"
  if (name === "OAuthExchangeError") return "registration_failed"
  if (name === "SealUnavailableError") return "sealing_unavailable"
  return "start_failed"
}
