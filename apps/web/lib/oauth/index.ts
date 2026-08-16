/**
 * OAuth 2.1 authorization-code client — public shape.
 *
 * Server-only. Every function here either holds the sealing key, performs a
 * server-side fetch against a third-party URL, or both.
 */
export { discoverAuthServer, DiscoveryError } from "./discovery"
export type { AuthServer } from "./discovery"
export { authorizeUrl, exchangeCode, registerClient, OAuthExchangeError } from "./client"
export type { AuthorizeParams, ExchangeParams, RegisteredClient, TokenResponse } from "./client"
export { createPkce, createState } from "./pkce"
export type { Pkce } from "./pkce"
export {
  clearFlowState,
  parseFlowState,
  readFlowState,
  writeFlowState,
  OAUTH_STATE_COOKIE,
} from "./state"
export type { OAuthFlowState } from "./state"
