import type { Metadata } from "next"
import { fetchQuery } from "convex/nextjs"

import { AuthorizeConsent } from "./consent"
import { AuthorizeRefusal } from "./refusal"
import { api } from "@convex/_generated/api"
import { convexOptions } from "@/lib/convex-server"
import { parseAuthorizationRequest } from "@/lib/oauth-authorize"

export const metadata: Metadata = { title: "Authorize access" }

/**
 * The OAuth consent screen (docs/18). `proxy.ts` gates `/oauth(.*)`, so a
 * signed-out visitor lands on sign-in and comes back with the query string
 * intact — an authorization request must survive that detour or every first-
 * time connect fails.
 *
 * Nothing on this page redirects on failure. A malformed or unregistered
 * request is a dead end HERE, deliberately: bouncing the browser to an
 * unverified `redirect_uri` in order to report an error is the open redirect,
 * and it is reachable before any human has approved anything.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const request = parseAuthorizationRequest(await searchParams)
  if (request === null) return <AuthorizeRefusal reason="malformed" />

  // Resolves the client and re-checks the redirect URI against its registered
  // list. Throws for anything it will not vouch for.
  const resolved = await fetchQuery(
    api.features.oauth.queries.describeRequest,
    {
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      codeChallengeMethod: request.codeChallengeMethod,
    },
    await convexOptions(),
  ).catch(() => null)

  if (resolved === null) return <AuthorizeRefusal reason="rejected" />

  return (
    <AuthorizeConsent
      clientName={resolved.clientName}
      // The SERVER's copy of the URI, never the one off the query string.
      redirectUri={resolved.redirectUri}
      clientId={request.clientId}
      codeChallenge={request.codeChallenge}
      codeChallengeMethod={request.codeChallengeMethod}
      state={request.state}
    />
  )
}
