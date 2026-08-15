/**
 * Environment loading with fail-fast validation.
 *
 * Env vars are a trust boundary (AGENTS.md P0): nothing is read out of
 * `process.env` anywhere else in the app, and every value is shape-checked here
 * before the process is allowed to serve traffic. Error messages name the
 * VARIABLE, never its value — a malformed secret must not land in a log line.
 */
import { GatewayError } from "@cg/core"

export type GatewayEnv = "development" | "production"

export type GatewayConfig = {
  env: GatewayEnv
  port: number
  /** Public origin AI clients hit. */
  publicUrl: string
  /** Dashboard origin the pairing flow sends a user to. */
  webPublicUrl: string
  convexUrl: string
  /** Proves "this caller is the gateway process" to Convex. Never logged. */
  serviceToken: string
  signing: { privateKey: string; publicKey: string; keyId: string }
  /** AES-256-GCM key for connection credentials at rest. May be "" in dev. */
  credentialEncryptionKey: string
}

export type EnvSource = Record<string, string | undefined>

const DEFAULT_PORT = "8787"
const DEFAULT_PUBLIC_URL = "http://localhost:8787"
const DEFAULT_WEB_URL = "http://localhost:3000"
const DEFAULT_KEY_ID = "k1"
const MIN_SERVICE_TOKEN_LENGTH = 16

function fail(message: string): never {
  throw new GatewayError("INVALID_INPUT", message)
}

function read(source: EnvSource, name: string): string {
  const value = source[name]
  return typeof value === "string" ? value.trim() : ""
}

function require_(source: EnvSource, name: string): string {
  const value = read(source, name)
  if (value.length === 0) fail(`Missing required environment variable: ${name}`)
  return value
}

function parsePort(raw: string): number {
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("GATEWAY_PORT must be an integer between 1 and 65535.")
  }
  return port
}

/** Absolute origin, no trailing slash. TLS is mandatory in production (docs/03). */
function parseUrl(raw: string, name: string, env: GatewayEnv): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return fail(`${name} must be an absolute URL.`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    fail(`${name} must be an http(s) URL.`)
  }
  if (env === "production" && url.protocol !== "https:") {
    fail(`${name} must use https in production.`)
  }
  return url.origin
}

function parseConvexUrl(raw: string, env: GatewayEnv): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return fail("CONVEX_URL must be an absolute URL.")
  }
  if (env === "production" && url.protocol !== "https:") {
    fail("CONVEX_URL must use https in production.")
  }
  return url.toString().replace(/\/$/, "")
}

/**
 * Crypto material is optional in development ONLY: `createApp` mints an
 * ephemeral keypair and encryption key at boot so `bun run dev` works with an
 * empty .env. Production must supply real, persistent values — an ephemeral
 * encryption key would silently make every stored credential unreadable after a
 * restart, and an ephemeral signing key would invalidate in-flight jobs.
 */
function requireInProduction(source: EnvSource, name: string, env: GatewayEnv): string {
  return env === "production" ? require_(source, name) : read(source, name)
}

export function loadConfig(source: EnvSource = process.env): GatewayConfig {
  const env: GatewayEnv = read(source, "NODE_ENV") === "production" ? "production" : "development"

  const serviceToken = require_(source, "GATEWAY_SERVICE_TOKEN")
  if (serviceToken.length < MIN_SERVICE_TOKEN_LENGTH) {
    fail(`GATEWAY_SERVICE_TOKEN must be at least ${MIN_SERVICE_TOKEN_LENGTH} characters.`)
  }

  const privateKey = requireInProduction(source, "JOB_SIGNING_PRIVATE_KEY", env)
  const publicKey = requireInProduction(source, "JOB_SIGNING_PUBLIC_KEY", env)
  if ((privateKey === "") !== (publicKey === "")) {
    fail("JOB_SIGNING_PRIVATE_KEY and JOB_SIGNING_PUBLIC_KEY must be set together.")
  }

  return {
    env,
    port: parsePort(read(source, "GATEWAY_PORT") || DEFAULT_PORT),
    publicUrl: parseUrl(read(source, "GATEWAY_PUBLIC_URL") || DEFAULT_PUBLIC_URL, "GATEWAY_PUBLIC_URL", env),
    webPublicUrl: parseUrl(read(source, "WEB_PUBLIC_URL") || DEFAULT_WEB_URL, "WEB_PUBLIC_URL", env),
    convexUrl: parseConvexUrl(require_(source, "CONVEX_URL"), env),
    serviceToken,
    signing: { privateKey, publicKey, keyId: read(source, "JOB_SIGNING_KEY_ID") || DEFAULT_KEY_ID },
    credentialEncryptionKey: requireInProduction(source, "CREDENTIAL_ENCRYPTION_KEY", env),
  }
}
