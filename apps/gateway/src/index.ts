/** Public surface of apps/gateway. `src/main.ts` is the process entry point. */
export { createApp } from "./app"
export type { AppOverrides, GatewayApp } from "./app"
export { loadConfig } from "./config"
export type { EnvSource, GatewayConfig, GatewayEnv } from "./config"
export { createRequestScope, resolveRequestId, toRequestContext, REQUEST_ID_HEADER } from "./context"
export type { RequestScope } from "./context"
export { announcedCapabilities, connectorsWithCapabilities, deviceCapabilitiesFor } from "./capabilities"
export { resolveCatalog } from "./catalog"
export type { CatalogDeps } from "./catalog"
export type { GatewayDeps } from "./deps"
export { BUILT_IN_MANIFESTS, createBuiltInRegistry } from "./registry"
export { resolveSecrets } from "./secrets"
export type { GatewaySecrets } from "./secrets"

export { handleHttp } from "./http/handle"
export { readJsonBody, MAX_BODY_BYTES } from "./http/body"
export { createRateLimiter } from "./http/rate-limit"
export type { RateLimiter, RateLimiterOptions } from "./http/rate-limit"
export { errorResponse, errorResponseFor, executionResponse, jsonResponse } from "./http/respond"
export { matchRoute, ROUTES } from "./http/routes"
export type { Route, RouteContext, RouteHandler, RouteMatch } from "./http/routes"

export { handleMcpRequest, toToolResult, MCP_PROTOCOL_VERSION, SERVER_INFO } from "./mcp/server"
export type { McpDeps, McpInput, McpOutcome } from "./mcp/server"
export { jsonRpcError, jsonRpcResult, parseJsonRpcRequest, JSONRPC_ERRORS } from "./mcp/jsonrpc"
export type { JsonRpcId, JsonRpcRequest, JsonRpcResponse } from "./mcp/jsonrpc"
export {
  actionIdFromToolName,
  createToolIndex,
  lookupTool,
  toolNameFor,
  ACTION_ID_RE,
  TOOL_NAME_RE,
} from "./mcp/tool-names"
export type { ToolIndex, ToolTarget } from "./mcp/tool-names"
export { targetsFor, toolsFor } from "./mcp/tools"
export type { McpTool } from "./mcp/tools"

export { executeAction } from "./pipeline/execute"
export type { ExecuteInput, PipelineDeps } from "./pipeline/execute"
export { appendAudit, safeId, toAuditEvent } from "./pipeline/audit"
export type { AuditInput } from "./pipeline/audit"
export { isIdentityKey, normalizeKey, stripIdentityFields } from "./pipeline/identity"
export type { StripResult } from "./pipeline/identity"

export { createRelay } from "./relay/relay"
export type { Relay, RelayDeps } from "./relay/relay"
export { createDispatcher, MAX_DISPATCH_TIMEOUT_MS } from "./relay/dispatch"
export type { Dispatcher } from "./relay/dispatch"
export { authenticateHello, flattenCapabilities } from "./relay/hello"
export type { HelloMessage, HelloOutcome } from "./relay/hello"
export { createSocketRegistry } from "./relay/sockets"
export type { SocketRegistry } from "./relay/sockets"
export { newSocketState, sendMessage, HELLO_DEADLINE_MS } from "./relay/types"
export type { RelaySocket, SocketState } from "./relay/types"

export { createControlPlane, createConvexControlPlane } from "./store/convex"
export type { GatewayControlPlane } from "./store/convex"
export { createControlPlaneClient } from "./store/client"
export type { ControlPlaneClient } from "./store/client"
export { REFS } from "./store/refs"
export { PAIRING_CODE_LENGTH, PAIRING_TTL_MS } from "./store/pairing"
export type { DeviceAuthResult, GatewayDeviceStore } from "./store/devices"
