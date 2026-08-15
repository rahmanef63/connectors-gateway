# adapters/careerpack

Reference cloud adapter.

## Executor

`cloud`

## Goal

Prove that the same gateway contract used for Blender also works with an ordinary hosted application.

## Initial scope

Choose a very small set of actions:

- one safe read;
- one non-destructive write;
- optionally one file/media flow.

Do not mirror every CareerPack tool during MVP.

The adapter may initially map normalized gateway action IDs to existing CareerPack tool names to preserve backward compatibility.

## Upstream surface

The mapping is not ours to invent — CareerPack already publishes these tools, and
`src/manifest.ts` mirrors their input schemas field for field (names, requiredness, the
status enum, and the descriptions a model reads before calling).

| Gateway action                 | CareerPack tool       | Source of truth                       |
| ------------------------------ | --------------------- | ------------------------------------- |
| `careerpack.profile.read`      | `profile_get`         | `convex/mcp/tools/profile.ts`         |
| `careerpack.application.create`| `applications_create` | `convex/mcp/tools/applications.ts`    |

Verified against those files on 2026-08-15. When CareerPack changes a tool, change
`src/upstream.ts` and `src/manifest.ts` together and regenerate the published example:

```
bun -e 'import {manifest} from "./adapters/careerpack/src/manifest.ts"; await Bun.write("examples/careerpack.connector.json", JSON.stringify(manifest, null, 2) + "\n")'
```

`src/example-sync.test.ts` fails if that file and the shipped manifest disagree.

Input is **not** validated here. The pipeline validates against `action.inputSchema`
before any adapter is reached (`apps/gateway/src/pipeline/execute.ts`, step 3); a second
validator in the adapter would be a second copy of one schema, and copies drift.
