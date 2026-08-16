# packages/registry

Connector discovery and version registry.

Owns:

- built-in connector registration;
- manifest validation;
- action lookup;
- connector version metadata;
- capability resolution.

MVP uses a trusted built-in registry. Third-party publishing can come later.

## Manifests are injected

The registry imports no adapter. Adapters depend on the registry, so the reverse
would be a cycle — the composition root passes manifests in.

```ts
const registry = createRegistry([...REMOTE_MCP_MANIFESTS, blenderManifest])
```

Remote-MCP connectors arrive as data — one generic adapter executes all of them —
so adding a connector never touches this package.

Every manifest is validated at construction; duplicate connector ids and
duplicate action ids are rejected. A built-in connector that fails its own
contract must not be able to boot the gateway. Action ids are globally unique
because they are already hierarchical and the MCP tool namespace is flat.

## API

```ts
createRegistry(manifests: ConnectorManifest[]): ConnectorRegistry
  get(connectorId): ConnectorManifest | undefined
  list(): ConnectorManifest[]
  resolve(connectorId, actionId): { connector, action }   // CONNECTOR_NOT_FOUND / ACTION_NOT_FOUND

catalogFor(registry, input): CatalogEntry[]
capabilityKey(connectorId, capability): string            // "blender:scene.render"
```

## Catalog

`catalogFor` implements the docs/07 intersection:

```text
installed connectors ∩ connected credentials ∩ device capabilities ∩ caller scopes
```

Workspace policy — the fifth term — is deliberately not applied here. A
`REQUIRE_APPROVAL` action still belongs in the catalog, and hiding a tool is
discovery, not authorization: `@cg/policy` re-checks on every execution.

Manifests declare capabilities connector-relative (`scene.render`); devices
announce them namespaced (`blender:scene.render`), so one connector can never
satisfy another's requirement.
