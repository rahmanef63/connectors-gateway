# apps/gateway

Public runtime edge.

## Responsibilities

- AI-facing MCP/API routes;
- authentication;
- request context;
- connector catalog;
- policy checks;
- cloud/local routing;
- relay integration;
- normalized responses;
- audit events.

## Suggested internal modules

```text
src/
├── mcp/
├── api/
├── context/
├── router/
├── relay/
├── errors/
└── health/
```

## Must not contain

- Blender-specific business logic;
- CareerPack-specific business logic;
- secrets hard-coded into routes;
- caller-controlled user identity.
