# adapters

Connector-specific implementations.

## Rule

An adapter translates normalized connector actions into the target application's actual API/protocol.

It should not own:

- user authentication to the gateway;
- global policy;
- device pairing;
- global audit storage.

## Adapters

```text
blender/      local   one application, one adapter
remote-mcp/   cloud   one adapter, every remote MCP server
```

There is no per-connector cloud package. A connector to a remote MCP server is a manifest
plus one `x-upstream` tool name per action — data, not code. `careerpack` is the first
instance of that generic type, not a bespoke adapter; see `remote-mcp/README.md`.

A new adapter is only justified when the target speaks something other than MCP.
