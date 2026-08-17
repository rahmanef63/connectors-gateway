/** In-memory doubles for the gateway tests. No network, no Convex, no sockets. */
import type {
  AuditEvent,
  AuditSink,
  Connection,
  ConnectionCredential,
  ConnectionStore,
  ConnectorManifest,
  Device,
  DeviceStore,
  ExecutionRequest,
  ExecutionResult,
  Executor,
  PairingStore,
  PolicyRule,
  PolicyStore,
} from "@cg/core"
import { TOKEN_PREFIXES, formatToken, hashSecret, newCredentialSecret } from "@cg/auth"
import type { ApiKeyLookup, ApiKeyRecord } from "@cg/auth"
import { createLogger } from "@cg/observability"
import type { Logger } from "@cg/observability"
import { createRegistry } from "@cg/registry"
import type { CatalogDeps } from "../catalog"
import type { GatewayConfig } from "../config"
import type { RequestScope } from "../context"
import type { GatewayDeps } from "../deps"
import { createRateLimiter } from "../http/rate-limit"
import type { PipelineDeps } from "../pipeline/types"
import type { OAuthStore } from "../store/oauth"

export const silentLogger: Logger = createLogger("test", { write: () => {} })

export function scope(requestId = "req_test"): RequestScope {
  return { requestId, receivedAt: 1_700_000_000_000, logger: silentLogger }
}

const objectSchema = (extra: Record<string, unknown> = {}) => ({
  type: "object",
  properties: {},
  ...extra,
})

const annotations = { readOnly: true, destructive: false, idempotent: true }

export const TEST_CONNECTOR = "testcloud"
export const TEST_LOCAL_CONNECTOR = "testlocal"

export const cloudManifest: ConnectorManifest = {
  id: TEST_CONNECTOR,
  name: "Test Cloud",
  version: "0.1.0",
  executor: "cloud",
  auth: { type: "bearer" },
  actions: [
    {
      id: "testcloud.echo",
      title: "Echo",
      description: "Returns whatever it is given.",
      // Deliberately OPEN, so identity stripping is observable rather than
      // masked by an additionalProperties:false rejection.
      inputSchema: objectSchema({ additionalProperties: true }),
      risk: "R0",
      annotations,
    },
    {
      id: "testcloud.strict",
      title: "Strict",
      description: "Requires a value.",
      inputSchema: objectSchema({
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false,
      }),
      risk: "R0",
      annotations,
    },
    {
      id: "testcloud.risky",
      title: "Risky",
      description: "Needs approval by default (R2).",
      inputSchema: objectSchema({ additionalProperties: true }),
      risk: "R2",
      annotations: { readOnly: false, destructive: false },
    },
    {
      id: "testcloud.forbidden",
      title: "Forbidden",
      description: "Denied by default (R4).",
      inputSchema: objectSchema({ additionalProperties: true }),
      risk: "R4",
      annotations: { readOnly: false, destructive: true },
    },
  ],
}

export const localManifest: ConnectorManifest = {
  id: TEST_LOCAL_CONNECTOR,
  name: "Test Local",
  version: "0.1.0",
  executor: "local",
  auth: { type: "device" },
  actions: [
    {
      id: "testlocal.render",
      title: "Render",
      description: "Needs a device capability.",
      inputSchema: objectSchema({ additionalProperties: true }),
      risk: "R0",
      annotations,
      requiredCapabilities: ["render"],
    },
  ],
}

export const testRegistry = createRegistry([cloudManifest, localManifest])

export const TEST_KEY_ID = "keytest1"

let keyPromise: Promise<{ token: string; record: ApiKeyRecord }> | null = null

/** One PBKDF2 run for the whole suite; 210k iterations is not free. */
export function testApiKey(): Promise<{ token: string; record: ApiKeyRecord }> {
  keyPromise ??= (async () => {
    const secret = newCredentialSecret()
    return {
      token: formatToken(TOKEN_PREFIXES.apiKey, TEST_KEY_ID, secret),
      record: {
        id: TEST_KEY_ID,
        userId: "usr_1",
        scopes: ["*"],
        status: "active",
        secretHash: await hashSecret(secret),
      },
    }
  })()
  return keyPromise
}

export function fakeApiKeys(record: ApiKeyRecord | null): ApiKeyLookup {
  return { getApiKey: async (keyId) => (record && record.id === keyId ? record : null) }
}

export function fakePolicy(rules: PolicyRule[] = []): PolicyStore {
  return { listRules: async () => rules }
}

export function fakeDevices(devices: Device[] = []): DeviceStore {
  return {
    get: async (deviceId) => devices.find((device) => device.id === deviceId) ?? null,
    listForUser: async () => devices,
    authenticate: async () => null,
    setPresence: async () => {},
  }
}

export function fakeConnections(
  connections: Connection[] = [],
  credential: ConnectionCredential | null = null,
): ConnectionStore {
  return {
    listForUser: async () => connections,
    resolveCredential: async () => credential,
  }
}

export type RecordingSink = AuditSink & { events: AuditEvent[] }

export function fakeAudit(): RecordingSink {
  const events: AuditEvent[] = []
  return { events, append: async (event) => void events.push(event) }
}

export type RecordingExecutor = Executor & { requests: ExecutionRequest[] }

export function fakeExecutor(result?: ExecutionResult): RecordingExecutor {
  const requests: ExecutionRequest[] = []
  return {
    requests,
    async execute(request) {
      requests.push(request)
      return result ?? { status: "success", output: { ok: true }, timingMs: 1 }
    },
  }
}

export function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: "dev_1",
    userId: "usr_1",
    displayName: "Workstation",
    platform: "linux",
    status: "online",
    credentialVersion: 1,
    capabilities: [],
    ...overrides,
  }
}

export const activeConnection: Connection = {
  id: "conn_1",
  connectorId: TEST_CONNECTOR,
  ownerType: "user",
  ownerId: "usr_1",
  authType: "bearer",
  status: "active",
}

export type TestDeps = PipelineDeps & { audit: RecordingSink; executor: RecordingExecutor }

export async function pipelineDeps(overrides: Partial<PipelineDeps> = {}): Promise<TestDeps> {
  const { record } = await testApiKey()
  const audit = fakeAudit()
  const executor = fakeExecutor()
  return {
    registry: testRegistry,
    apiKeys: fakeApiKeys(record),
    policy: fakePolicy(),
    devices: fakeDevices(),
    audit,
    executor,
    logger: silentLogger,
    ...overrides,
  } as TestDeps
}

export function fakePairing(overrides: Partial<PairingStore> = {}): PairingStore {
  return {
    createChallenge: async (input) => ({
      id: "pair_0123456789abcdef0123456789abcd",
      code: "ABCD2345",
      deviceName: input.deviceName,
      platform: input.platform,
      status: "pending",
      expiresAt: 1_700_000_300_000,
    }),
    claim: async (challengeId) =>
      challengeId === "pair_0123456789abcdef0123456789abcd"
        ? { device: makeDevice(), credential: "cgd_dev_1_abcdefabcdefabcdef" }
        : null,
    ...overrides,
  }
}

export const testConfig: GatewayConfig = {
  env: "development",
  port: 8787,
  webPublicUrl: "http://localhost:3000",
  publicUrl: "http://localhost:8787",
  convexUrl: "http://127.0.0.1:3210",
  serviceToken: "a-service-token-long-enough",
  signing: { privateKey: "", publicKey: "cHVibGlj", keyId: "k1" },
  credentialEncryptionKey: "",
}

export type TestGatewayDeps = GatewayDeps & TestDeps

/**
 * An OAuth store that records what it was asked and answers plausibly. The real
 * verification lives in Convex (`service/oauth`), so what the HTTP tests need
 * from this is the request shaping and the error mapping, not a second PKCE
 * implementation to disagree with the first.
 */
export function fakeOAuth(
  overrides: Partial<OAuthStore> = {},
): OAuthStore & { calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = []
  return {
    calls,
    async registerClient(input) {
      calls.push({ method: "registerClient", ...input })
      return {
        clientId: "cgc_test",
        clientName: input.clientName,
        redirectUris: input.redirectUris,
        createdAt: 1_700_000_000_000,
      }
    },
    async redeemCode(input) {
      calls.push({ method: "redeemCode", ...input })
      return { accessToken: "cgk_key_test_" + "a".repeat(32), expiresIn: 3600 }
    },
    ...overrides,
  }
}

/** Everything an HTTP handler needs. The relay is a stub: no handler touches it. */
export async function httpDeps(overrides: Partial<TestGatewayDeps> = {}): Promise<TestGatewayDeps> {
  const base = await mcpDeps(overrides as Partial<TestMcpDeps>)
  return {
    ...base,
    config: testConfig,
    pairing: fakePairing(),
    oauth: fakeOAuth(),
    pairingLimiter: createRateLimiter({ limit: 5, windowMs: 60_000 }),
    claimLimiter: createRateLimiter({ limit: 60, windowMs: 60_000 }),
    edgeLimiter: createRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    oauthLimiter: createRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    relay: {} as GatewayDeps["relay"],
    ...overrides,
  } as TestGatewayDeps
}

export type TestMcpDeps = TestDeps & CatalogDeps

/** Pipeline deps plus the catalog ports the MCP endpoint needs. */
export async function mcpDeps(overrides: Partial<TestMcpDeps> = {}): Promise<TestMcpDeps> {
  const base = await pipelineDeps(overrides)
  return {
    ...base,
    connections: fakeConnections([activeConnection]),
    ...overrides,
  } as TestMcpDeps
}
