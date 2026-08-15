/**
 * Environment variables are a trust boundary (AGENTS.md P0): every value is
 * validated here, once, before anything else reads it.
 */
import { GatewayError } from "@cg/core"
import { requireGatewayUrl, resolveConfigDir } from "./config"

export type EnvSource = Record<string, string | undefined>

export type AgentEnv = {
  configDir: string
  /** Set only when CG_GATEWAY_URL is present; the stored config is the fallback. */
  gatewayUrl?: string
  /** Set only when BLENDER_BRIDGE_URL is present; the adapter default applies otherwise. */
  blenderBridgeUrl?: string
}

export function readAgentEnv(source: EnvSource = process.env): AgentEnv {
  const env: AgentEnv = { configDir: resolveConfigDir(source) }
  const gatewayUrl = text(source["CG_GATEWAY_URL"])
  if (gatewayUrl !== undefined) env.gatewayUrl = requireGatewayUrl(gatewayUrl)
  const bridgeUrl = text(source["BLENDER_BRIDGE_URL"])
  if (bridgeUrl !== undefined) env.blenderBridgeUrl = bridgeUrl
  return env
}

/** `pair` has no stored config to fall back on, so the variable is mandatory. */
export function requireEnvGatewayUrl(env: AgentEnv): string {
  if (env.gatewayUrl === undefined) {
    throw new GatewayError("INVALID_INPUT", "CG_GATEWAY_URL is not set. Point it at the relay, e.g. wss://gateway.example.com/device.")
  }
  return env.gatewayUrl
}

/**
 * The pairing REST calls live on the same origin as the relay socket, so the
 * agent only ever needs one endpoint variable. ws -> http, wss -> https.
 */
export function httpBaseFrom(gatewayUrl: string): string {
  const url = new URL(requireGatewayUrl(gatewayUrl))
  const protocol = url.protocol === "wss:" ? "https:" : "http:"
  return `${protocol}//${url.host}`
}

function text(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
