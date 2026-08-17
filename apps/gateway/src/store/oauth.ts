/**
 * The OAuth authorization-server port, backed by Convex.
 *
 * Both calls are mutations on the control plane: this process holds no code
 * table and no client table of its own, so a gateway restart mid-flow loses
 * nothing and two gateway replicas cannot disagree about whether a code was
 * already spent.
 */
import { GatewayError } from "@cg/core"
import type { ControlPlaneClient } from "./client"
import { asRecord, asStringArray } from "./guards"
import { REFS } from "./refs"

export type RegisteredClient = {
  clientId: string
  clientName: string
  redirectUris: string[]
  createdAt: number
}

export type IssuedToken = { accessToken: string; expiresIn: number }

export interface OAuthStore {
  registerClient(input: { clientName: string; redirectUris: string[] }): Promise<RegisteredClient>
  redeemCode(input: {
    code: string
    codeVerifier: string
    clientId: string
    redirectUri: string
  }): Promise<IssuedToken>
}

/** A control-plane response is external input (P0), including this one. */
function toRegisteredClient(value: unknown): RegisteredClient | null {
  const row = asRecord(value)
  if (!row) return null
  const { clientId, clientName, createdAt } = row
  if (typeof clientId !== "string" || clientId.length === 0) return null
  if (typeof clientName !== "string") return null
  if (typeof createdAt !== "number") return null
  return { clientId, clientName, redirectUris: asStringArray(row.redirectUris), createdAt }
}

/**
 * `{ok: false}` is a REFUSAL, distinct from a malformed response.
 *
 * The control plane returns rather than throws on a bad grant, because a Convex
 * mutation that throws rolls back its own `delete` and un-burns the code. The
 * throw belongs here instead, in a process where nothing is transactional.
 */
function toIssuedToken(value: unknown): IssuedToken | "refused" | null {
  const row = asRecord(value)
  if (!row) return null
  if (row.ok === false) return "refused"
  const { accessToken, expiresIn } = row
  if (typeof accessToken !== "string" || accessToken.length === 0) return null
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) return null
  return { accessToken, expiresIn }
}

export function createOAuthStore(client: ControlPlaneClient): OAuthStore {
  return {
    async registerClient(input): Promise<RegisteredClient> {
      const registered = toRegisteredClient(await client.mutation(REFS.oauthRegisterClient, input))
      if (registered === null) {
        // A malformed response must not become a client id the caller then
        // fails to use ten minutes later, with no trace of why.
        throw new Error("The control plane returned an unusable client registration.")
      }
      return registered
    },

    async redeemCode(input): Promise<IssuedToken> {
      const issued = toIssuedToken(await client.mutation(REFS.oauthRedeemCode, input))
      if (issued === "refused") {
        throw new GatewayError("NOT_AUTHORIZED", "Invalid authorization grant.")
      }
      if (issued === null) throw new Error("The control plane returned an unusable token.")
      return issued
    },
  }
}
