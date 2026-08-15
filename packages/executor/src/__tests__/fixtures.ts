/** Shared test doubles. Not part of the package's public surface. */
import type {
  ActionDefinition,
  Connection,
  ConnectionCredential,
  ConnectionStore,
  ConnectorManifest,
  Device,
  DeviceStore,
  ExecutionRequest,
  ExecutorKind,
  RequestContext,
} from "@cg/core"

export function makeAction(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id: "blender.scene.render",
    title: "Render scene",
    description: "Render the active scene.",
    inputSchema: { type: "object" },
    risk: "R2",
    annotations: { readOnly: false, destructive: false },
    ...overrides,
  }
}

export function makeManifest(
  executor: ExecutorKind,
  overrides: Partial<ConnectorManifest> = {},
): ConnectorManifest {
  return {
    id: executor === "cloud" ? "careerpack" : "blender",
    name: executor === "cloud" ? "CareerPack" : "Blender",
    version: "0.1.0",
    executor,
    auth: { type: executor === "cloud" ? "bearer" : "device" },
    actions: [],
    ...overrides,
  }
}

export function makeContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: "req_test",
    receivedAt: 1_700_000_000_000,
    principal: { callerId: "caller_gpt", userId: "user_1", scopes: [] },
    ...overrides,
  }
}

export function makeRequest(
  executor: ExecutorKind,
  overrides: Partial<ExecutionRequest> = {},
): ExecutionRequest {
  return {
    context: makeContext(),
    connector: makeManifest(executor),
    action: makeAction(),
    input: { camera: "main" },
    ...overrides,
  }
}

export function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: "dev_1",
    userId: "user_1",
    displayName: "workstation",
    platform: "linux",
    status: "online",
    credentialVersion: 1,
    capabilities: [],
    ...overrides,
  }
}

/** ConnectionStore fake. `resolveCredential` returns the stored ciphertext. */
export function fakeConnections(credential: ConnectionCredential | null): ConnectionStore {
  return {
    async listForUser(): Promise<Connection[]> {
      return []
    },
    async resolveCredential(): Promise<ConnectionCredential | null> {
      return credential
    },
  }
}

export function fakeDevices(devices: Device[]): DeviceStore {
  return {
    async get(deviceId: string): Promise<Device | null> {
      return devices.find((device) => device.id === deviceId) ?? null
    },
    async listForUser(userId: string): Promise<Device[]> {
      return devices.filter((device) => device.userId === userId)
    },
    async authenticate(): Promise<Device | null> {
      return null
    },
    async setPresence(): Promise<void> {},
    async revoke(): Promise<void> {},
  }
}
