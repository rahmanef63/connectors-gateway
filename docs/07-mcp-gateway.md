# MCP gateway

## Role

The MCP layer is a protocol adapter on top of the connector platform. It is not
a second workflow engine and it never bypasses the normal policy, approval,
execution, audit, timeout, or output-redaction path.

```text
Connector Core
   ├── MCP adapter
   ├── REST adapter
   └── SDK adapter
```

## Responsibilities

- authenticate before parsing or dispatching the MCP body;
- expose only connectors/actions authorized for the current user/workspace;
- map MCP tool calls to normalized connector actions;
- attach authenticated identity server-side and drop caller-supplied identity;
- validate action input and normalize/redact output;
- map manifest metadata to host-facing tool descriptors without weakening it;
- export one bounded operating skill to hosts that support MCP skills/resources.

## Transport compatibility

The endpoint is dual-stack:

| Family | Revisions | Entry point |
| --- | --- | --- |
| Initialize-based MCP | `2024-11-05`, `2025-03-26`, `2025-06-18` | `initialize` |
| Stateless MCP | `2026-07-28` | `server/discover` and per-request `_meta` |

The modern path validates every duplicated routing value before dispatch:

- body and `MCP-Protocol-Version` must agree;
- body method and `Mcp-Method` must agree;
- tool/resource name and `Mcp-Name` must agree;
- client capabilities must be supplied per request;
- unsupported versions return the dedicated MCP protocol error and the supported
  modern version.

The old and new paths end in the same `executeAction()` pipeline. Supporting a
new transport never creates a second permission model.

## ChatGPT-facing descriptors

Every listed tool includes:

- stable normalized `name` and human-readable `title`;
- a focused description that begins with when the tool should be used;
- object `inputSchema` and `outputSchema`;
- OAuth security schemes at the current and compatibility metadata locations;
- all four safety annotations (`readOnly`, `destructive`, `idempotent`, and
  `openWorld`) mapped from the connector manifest;
- short invocation status text for ChatGPT;
- deterministic ordering and a SHA-256 toolset digest.

There is deliberately no widget metadata. The gateway returns operational data,
not a first-party interactive UI. A future action may add a widget only when the
result genuinely benefits from one.

## Dynamic tool catalog

A user's catalog is the intersection of:

```text
installed connectors
∩ connected credentials
∩ current online device capabilities
∩ workspace policy
∩ caller scopes
```

An action outside that catalog cannot reach the registry or executor. Unknown
names are rejected and audited without revealing another user's tools.

## Skills and resources

The package's `plugin/skills/connectors-gateway/SKILL.md` is also exported over
MCP through:

- `skills/list`;
- `skills/get`;
- `resources/list`;
- `resources/read`.

The skill snapshot carries a SHA-256 digest. Modern resource/list results include
private cache hints, and all modern results include server identity plus
`resultType: "complete"`.

## Important separation

The gateway exposes one public MCP endpoint, but local applications do not become
internet-facing MCP servers. The local agent still dials the gateway outbound,
and Blender remains loopback-only.
