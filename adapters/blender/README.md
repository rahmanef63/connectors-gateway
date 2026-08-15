# adapters/blender

Reference local adapter. Runs inside the local agent on the user's machine and talks to a
Blender add-on bound to loopback — the proof that a local app is reachable with no inbound
port.

## Executor

`local`

## Dependencies

Requires:

- paired device;
- local Connectors Agent;
- Blender running or launch/detection strategy;
- compatible Blender bridge/add-on bound to loopback (`bridge/`).

## Actions

```text
blender.scene.inspect      R0  read-only
blender.object.list        R0  read-only
blender.material.list      R0  read-only
blender.object.create      R1
blender.object.transform   R2
blender.material.apply     R2
blender.scene.render       R2
blender.file.export        R3  writes a file
```

## Never implemented

```text
blender.python.execute
blender.shell.execute
blender.filesystem.raw
```

These are absent from the manifest and from the bridge's route table, not present-and-
disabled. An action that does not exist cannot be re-enabled by a policy edit, a config
typo, or prompt injection (AGENTS.md invariant 7).

## Layout

```text
src/manifest.ts        connector manifest (actions live in actions-read.ts / actions-write.ts)
src/bridge-client.ts   loopback guard + JSON-over-HTTP client
src/paths.ts           export-path validation + path stripping for model-visible output
src/normalize.ts       bridge response -> safe output
src/adapter.ts         detect() / execute()
bridge/                the Blender add-on (see bridge/README.md)
```

## Safety properties

- `assertLoopback()` runs in the `BridgeClient` constructor **and** before every request.
  A non-loopback bridge URL is `NOT_AUTHORIZED`, always (AGENTS.md invariant 3).
- `detect()` never throws. An unreachable bridge reports `status: "unavailable"` with an
  empty capability list, so the agent still comes online for its other adapters.
- A bridge may only confirm capabilities this adapter already declares; it cannot announce
  new ones.
- No local filesystem path reaches model-visible output. File results are rebuilt as
  `{ file: { name, mimeType, sizeBytes } }`; other responses are walked and scrubbed.
- Exports are confined to one root (default `<temp>/connectors-gateway/blender-exports`),
  validated by the adapter and re-validated by the bridge.

## Usage

```ts
import { createBlenderAdapter } from "@cg/adapter-blender"

const adapter = createBlenderAdapter({ bridgeUrl: "http://127.0.0.1:8787" })
const report = await adapter.detect()
```

See `docs/11-blender-reference.md` and `bridge/README.md`.
