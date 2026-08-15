# Relationship with `rahmanef63/connectors`

## Separation

```text
rahmanef63/connectors
= cookbook / SSOT / recipes / integration guidance

rahmanef63/connectors-gateway
= runtime / gateway / product / execution
```

## Cookbook should teach

Examples:

```text
recipes/blender
recipes/careerpack
patterns/local-bridge
patterns/oauth
patterns/file-input
patterns/mcp
```

## Gateway should implement

Examples:

```text
registry
auth
policy
routing
cloud executor
local executor
device relay
audit
SDK
```

## Rule

When a gateway implementation discovers a reusable integration lesson:

1. fix the runtime here;
2. document the reusable recipe in `connectors`;
3. link the runtime implementation as a reference example;
4. avoid copying the same explanation into both repos.

## Blender recipe relationship

The cookbook explains:

- why local MCP differs from hosted MCP;
- loopback bridge pattern;
- security caveats;
- how to build an adapter.

The gateway owns:

- actual device pairing;
- relay protocol;
- production policy;
- job routing;
- Blender adapter implementation.
