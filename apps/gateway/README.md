# apps/gateway

Public runtime edge. **One** Bun process serving HTTP (MCP + REST) *and* the
device-relay WebSocket, so dispatching a job to a paired device is an in-process
function call rather than a queue hop (docs/01, docs/12).

## Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/healthz` | none | liveness only, no data |
| POST | `/mcp` | bearer | MCP JSON-RPC (`initialize`, `tools/list`, `tools/call`, `ping`) |
| GET | `/v1/catalog` | bearer | the caller's resolved tool catalog |
| POST | `/v1/actions/:connector/:action` | bearer | REST execution |
| POST | `/v1/pair/start` | none, rate limited | agent asks for a pairing code |
| POST | `/v1/pair/claim` | none, rate limited | agent claims its credential, once |
| WS | `/device` | `hello` frame | agent relay session |

## Internal modules

```text
src/
├── main.ts              Bun.serve({port, fetch, websocket}) — one server
├── app.ts               composition root: every port bound exactly once
├── config.ts            env loading + fail-fast validation
├── secrets.ts           signing key / credential key resolution (dev generates)
├── context.ts           request id, principal attachment, per-request logger
├── registry.ts          built-in connector manifests
├── catalog.ts           installed ∩ connected ∩ capabilities ∩ scopes
├── capabilities.ts      what the user's ONLINE devices can do
├── deps.ts              the wired dependency set (types only)
├── http/
│   ├── handle.ts        entry point, testable without Bun.serve
│   ├── routes.ts        the route table
│   ├── handlers/        one file per route
│   ├── body.ts          content-type + size-capped JSON reading
│   ├── rate-limit.ts    fixed window, for the unauthenticated pairing routes
│   └── respond.ts       {error:{code,message}} + httpStatusFor
├── mcp/
│   ├── server.ts        JSON-RPC adapter over the pipeline
│   ├── jsonrpc.ts       envelope parsing/shaping
│   ├── tool-names.ts    "blender.scene.render" <-> "blender_scene_render"
│   └── tools.ts         catalog -> MCP tool descriptors
├── pipeline/
│   ├── execute.ts       THE execution path
│   ├── decide.ts        step 5, policy
│   ├── identity.ts      step 4, identity-field stripping
│   └── audit.ts         step 7, audit assembly
├── relay/
│   ├── relay.ts         Bun WebSocket handlers, presence, heartbeat sweep
│   ├── hello.ts         the handshake (4001 / 4003 / 4004)
│   ├── dispatch.ts      JobDispatcher: pending map, timeout, cancel
│   └── sockets.ts       deviceId -> live socket
├── store/               ControlPlane over Convex, one file per port
└── scripts/keygen.ts    prints an Ed25519 keypair for .env
```

## The execution pipeline

`src/pipeline/execute.ts` is the only path to an adapter. Fixed order:

1. authenticate the caller (`@cg/auth`) — 401 on failure;
2. resolve connector + action from the registry;
3. validate input against `action.inputSchema` (`@cg/schemas`);
4. strip identity-shaped fields the caller supplied (docs/05);
5. evaluate policy (`@cg/policy`) — DENY → `POLICY_DENIED`, REQUIRE_APPROVAL → `APPROVAL_REQUIRED`;
6. route cloud vs local (`@cg/executor`) and execute;
7. write an audit event in a `finally` — success and every error path;
8. normalize the response.

## Must not contain

- Blender-specific or CareerPack-specific business logic (only their manifests);
- a local adapter — `blenderAdapter` runs inside `apps/agent`, never here;
- secrets hard-coded into routes;
- caller-controlled user identity.

## Development

```bash
bun run --cwd apps/gateway keygen   # print JOB_SIGNING_* + CREDENTIAL_ENCRYPTION_KEY
bun run dev:gateway                 # CONVEX_URL + GATEWAY_SERVICE_TOKEN required
bun test apps/gateway
```

In development the signing keypair and the credential encryption key are
generated at boot if absent, with a warning. In production `loadConfig` refuses
to start without them, and both public origins must be `https`.
