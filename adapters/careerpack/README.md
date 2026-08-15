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
