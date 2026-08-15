# MCP gateway

## Role

The MCP layer is a protocol adapter on top of the connector platform. It is not the entire architecture.

```text
Connector Core
   ├── MCP adapter
   ├── REST adapter
   └── SDK adapter
```

## Responsibilities

- expose only connectors/actions authorized for the current user/workspace;
- map MCP tool calls to normalized connector actions;
- attach authenticated identity server-side;
- never trust identity fields supplied in tool arguments;
- normalize outputs;
- map action metadata to host-facing annotations when possible.

## Dynamic tool catalog

A user's catalog may be built from:

```text
installed connectors
∩ connected credentials
∩ current device capabilities
∩ workspace policy
∩ caller scopes
```

Example:

```text
User A
├── careerpack.application.create
├── careerpack.portfolio.attach_media
└── blender.scene.render

User B
├── github.issue.create
└── gmail.message.send
```

## Important separation

The gateway can expose an MCP endpoint, but local apps do not themselves need to become internet-facing MCP servers.
