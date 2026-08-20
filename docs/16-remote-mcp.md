
## Streamable HTTP compatibility

The generic remote-MCP adapter now prefers the standard Streamable HTTP lifecycle for every call:

1. `initialize` with the pinned MCP protocol revision;
2. propagate a validated `Mcp-Session-Id` when the server issues one;
3. send `notifications/initialized`;
4. execute `tools/call` in that session.

SSE responses are bounded and parsed as event streams: notification/progress events are ignored until the JSON-RPC response matching the request id arrives. Plain JSON remains supported. A reviewed legacy server that explicitly does not implement `initialize` (HTTP 404/405 or JSON-RPC `-32601`) falls back to the historical direct `tools/call` path.

Transient transport failures are retried at most once only when the manifest marks the action read-only or idempotent. Non-idempotent writes are never replayed automatically because a network failure can happen after the upstream already performed the operation.
