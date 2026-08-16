# adapters/remote-mcp

The generic cloud adapter for **any** remote MCP server. There is one of these, forever.

## Executor

`cloud`

## The point

A connector to a remote MCP server is **data, not code** (`docs/16-connector-strategy.md`):

- a manifest — id, auth type, and the normalized action surface;
- one `x-upstream` name per action — the tool the upstream server actually publishes.

Both are JSON. Adding a connector is a file in `connectors/` plus one line in
`src/connectors.ts`. No package, no adapter, no gateway change.

```ts
createRemoteMcpAdapter(manifest) // -> CloudAdapter
```

`baseUrl` and `token` are not in the manifest: they come from the caller's `connections`
row and are handed to `execute()` by the executor, already decrypted. The adapter owns no
auth, no policy, no audit (`adapters/README.md`).

## Where a manifest lives

`connectors/<id>.connector.json` — one copy, the one the gateway boots and validates. It is
also the machine-readable illustration of the contract; a second published copy would only
be a thing to drift.

`src/connectors.ts` runs every file through `validateManifest` at module load, so a
malformed manifest stops the process instead of failing on the first call. That gate is why
these files can become user-written database rows (`docs/16` step 3) without new code.

## `x-upstream`

```json
{ "id": "careerpack.profile.read", "x-upstream": "profile_get" }
```

Described and type-checked in `packages/schemas/connector-manifest.schema.json`. An action
that omits it is **`ACTION_NOT_FOUND`** — the adapter never derives a name from the action
id. `careerpack.profile.read` → `profile_read` looks right and the server publishes
`profile_get`; worse, on a server that publishes both `thing_read` and `thing_delete` a
near-miss guess is a silent wrong call rather than a 404.

The mapping is not ours to invent. When an upstream renames a tool, edit the two JSON files
together — nothing else changes.

## Shipped connectors

| Connector | Action | Upstream tool | Source of truth |
| --- | --- | --- | --- |
| `careerpack` | `careerpack.profile.read` | `profile_get` | `convex/mcp/tools/profile.ts` |
| `careerpack` | `careerpack.application.create` | `applications_create` | `convex/mcp/tools/applications.ts` |

Verified against those files on 2026-08-15.

## What this adapter does not do

Input is **not** validated here. The pipeline validates against `action.inputSchema` before
any adapter is reached (`apps/gateway/src/pipeline/execute.ts`, step 3); a second validator
would be a second copy of one schema, and copies drift.

The transport is one JSON-RPC `tools/call` over HTTP POST — no `initialize` handshake, no
session id, no retry. It refuses redirects (the Authorization header would follow) and caps
the response body at 1 MiB (an endless stream would exhaust memory for every other tenant).
Upgrade path is the official MCP TypeScript SDK transport once sessions, sampling, or
progress notifications are needed.
