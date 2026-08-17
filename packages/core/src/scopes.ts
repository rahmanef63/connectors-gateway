/**
 * The scope vocabulary, in one place because three parties have to agree on it:
 * a manifest DECLARES a scope on an action, the issuer GRANTS scopes to a
 * credential, and `catalogFor` HIDES any action whose declared scopes are not
 * held. Get those three out of step and the failure is silent — the action does
 * not error, it simply stops existing for that caller.
 *
 * That is not hypothetical. `careerpack.connector.json` declared `mcp.read` and
 * `mcp.write` while every issued credential carried `scopes: []`, so both of its
 * actions vanished from the catalog for every caller in the system. Nothing
 * threw. `scopes.test.ts` is the guard that now makes that a failing test.
 */

/** Read-only actions. */
export const SCOPE_READ = "mcp.read"
/** Anything that writes, including destructive actions. */
export const SCOPE_WRITE = "mcp.write"

/**
 * Every scope a manifest may require, and exactly what an issued credential is
 * granted today.
 *
 * There is no per-scope consent UI yet, so a credential gets the whole set or
 * it would not work at all. Narrowing this is a real feature (a read-only token
 * for an AI client is worth having) — but it needs a way for the user to CHOOSE,
 * and until then handing out less would only hide connectors from them.
 */
export const MCP_SCOPES: readonly string[] = Object.freeze([SCOPE_READ, SCOPE_WRITE])

/** What `api_keys:issue` and the OAuth token endpoint write onto a credential. */
export function grantedScopes(): string[] {
  return [...MCP_SCOPES]
}
