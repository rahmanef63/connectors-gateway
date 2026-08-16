/**
 * The parts of the connect flow that are not themselves Server Actions.
 *
 * Split out because a `"use server"` module may export nothing but async
 * functions — a shared type or a synchronous helper living there is a build
 * error, not a style choice.
 */
import type { AuthType } from "@cg/core"
import { fetchMutation, fetchQuery } from "convex/nextjs"
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server"

import { api } from "@convex/_generated/api"
import { manifestFor } from "@/lib/catalog"
import { sealCredential } from "@/lib/credentials"
import type { ConnectErrorCode } from "@/components/connections/labels"

export type ConnectFormState = {
  readonly error: ConnectErrorCode | null
  /** Connector id, set when this submission finished the job with no redirect. */
  readonly connected?: string
}

export const fail = (error: ConnectErrorCode): ConnectFormState => ({ error })

/** The caller's identity, proven by Convex rather than assumed from a cookie. */
export async function requireViewerToken(): Promise<string | null> {
  const token = await convexAuthNextjsToken()
  if (token === undefined || token.length === 0) return null
  try {
    await fetchQuery(api.features.auth.queries.viewer, {}, { token })
    return token
  } catch {
    return null
  }
}

export function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === "string" ? value.trim() : ""
}

export type Connectable = {
  readonly id: string
  readonly endpoint: string
  readonly authType: AuthType
}

/** A cloud connector this build ships, with an address to talk to. */
export function connectable(connectorId: string): Connectable | null {
  const manifest = manifestFor(connectorId)
  if (manifest === null || manifest.executor !== "cloud") return null
  if (typeof manifest.endpoint !== "string" || manifest.endpoint.length === 0) return null
  return { id: manifest.id, endpoint: manifest.endpoint, authType: manifest.auth.type }
}

/**
 * Seal, then write. The plaintext exists only in this function's frame: it is
 * never returned to the browser, never logged, and Convex receives ciphertext
 * it has no key for.
 */
export async function storeConnection(
  target: Connectable,
  plaintext: string,
  token: string,
): Promise<void> {
  await fetchMutation(
    api.features.connections.mutations.upsert,
    {
      connectorId: target.id,
      baseUrl: target.endpoint,
      tokenCipher: await sealCredential(plaintext),
      authType: target.authType,
    },
    { token },
  )
}

/** Never surfaces a third party's error text — only a code this app owns. */
export function classify(error: unknown): ConnectErrorCode {
  const name = error instanceof Error ? error.name : ""
  if (name === "DiscoveryError") return "discovery_failed"
  if (name === "OAuthExchangeError") return "registration_failed"
  if (name === "SealUnavailableError") return "sealing_unavailable"
  return "start_failed"
}
