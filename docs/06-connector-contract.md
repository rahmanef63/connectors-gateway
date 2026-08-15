# Connector contract

## Goal

Make cloud and local integrations look identical to the routing and policy layers.

## Conceptual manifest

```ts
type ConnectorManifest = {
  id: string
  name: string
  version: string

  executor: "cloud" | "local"

  auth: {
    type:
      | "none"
      | "oauth2"
      | "api_key"
      | "bearer"
      | "device"
      | "custom"
  }

  actions: ActionDefinition[]
}
```

## Action definition

```ts
type ActionDefinition = {
  id: string
  title: string
  description: string

  inputSchema: object
  outputSchema?: object

  risk: "R0" | "R1" | "R2" | "R3" | "R4"

  annotations: {
    readOnly: boolean
    destructive: boolean
    idempotent?: boolean
  }

  requiredScopes?: string[]
  requiredCapabilities?: string[]
}
```

## Naming

Prefer stable hierarchical IDs:

```text
blender.scene.inspect
blender.scene.render
blender.object.create
blender.object.transform

careerpack.application.create
careerpack.portfolio.attach_media
```

If an existing external tool surface is already published, do not rename it casually. The gateway can map public IDs to existing upstream names.

## Connector contract requirements

Every connector must define:

- manifest;
- actions;
- input validation;
- normalized error mapping;
- executor type;
- authentication requirements;
- permission/risk metadata;
- health/capability detection where applicable.

## Do not put transport details in action semantics

Bad:

```text
blender.socket.send_python
```

Good:

```text
blender.object.create
```

The adapter owns the socket/Python implementation.
