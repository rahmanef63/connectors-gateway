# packages/schemas

JSON Schemas and validation artifacts for contracts shared across services.

Schemas are versioned contracts, not informal TypeScript-only shapes. The `.json`
files are the source of truth; the `@cg/core` / `@cg/protocol` types mirror them.

## Frozen contracts (Phase 0)

| File                              | Mirrors                       | Shape  |
| --------------------------------- | ----------------------------- | ------ |
| `connector-manifest.schema.json`   | `@cg/core` `ConnectorManifest` | open   |
| ↳ `#/$defs/action`                 | `@cg/core` `ActionDefinition`  | open   |
| `job-envelope.schema.json`         | `@cg/protocol` `JobEnvelope`   | closed |
| `agent-result.schema.json`         | `@cg/protocol` `AgentResult`   | closed |
| `device-capability.schema.json`    | `@cg/core` `CapabilityReport`  | closed |

"Closed" means `additionalProperties: false`. The job envelope is signed, so an
unknown property is a tampering signal rather than a forward-compatible
extension; the agent result and capability report arrive from a user machine and
are validated before anything reads them.

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

connectorManifestSchema | jobEnvelopeSchema | agentResultSchema | deviceCapabilitySchema | SCHEMAS
```

Import the exported schema objects rather than re-importing the `.json` file:
compiled validators are cached by schema identity.

## Error discipline

Failures throw `GatewayError("INVALID_INPUT", …)`. The message aggregates JSON
pointers and failing keywords only — never the offending value, which may be an
API key, a bearer token, or an absolute local path.
