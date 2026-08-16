# packages/schemas

JSON Schemas and validation artifacts for contracts shared across services.

Schemas are versioned contracts, not informal TypeScript-only shapes. The `.json`
files are the source of truth; the `@cg/core` / `@cg/protocol` types mirror them.

## Frozen contracts (Phase 0)

| File                              | Mirrors                       | Shape  |
| --------------------------------- | ----------------------------- | ------ |
| `connector-manifest.schema.json`   | `@cg/core` `ConnectorManifest` | open   |
| ↳ `#/$defs/action`                 | `@cg/core` `ActionDefinition`  | open   |

The agent-facing wire shapes (job envelope, agent result, capability report) are
enforced by the hand-written guards in `packages/protocol/src/agent-frames.ts`,
not by JSON Schema.

Every action must declare an `inputSchema` (`outputSchema` is optional). An
action with no input schema could never validate AI-supplied input, so the
manifest is rejected outright.

## API

```ts
validateManifest(value: unknown): ConnectorManifest
validateActionInput(schema: JsonSchema, input: unknown): unknown
validateOrThrow(schema: JsonSchema, value: unknown, label: string): void
compileSchema(schema: JsonSchema): ValidateFunction
safeErrorMessage(prefix: string, errors): string

connectorManifestSchema
```

Import the exported schema object rather than re-importing the `.json` file:
compiled validators are cached by schema identity.

## Error discipline

Failures throw `GatewayError("INVALID_INPUT", …)`. The message aggregates JSON
pointers and failing keywords only — never the offending value, which may be an
API key, a bearer token, or an absolute local path.
