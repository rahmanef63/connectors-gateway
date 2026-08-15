# adapters/blender

Reference local adapter.

## Executor

`local`

## Dependencies

Requires:

- paired device;
- local Connectors Agent;
- Blender running or launch/detection strategy;
- compatible Blender bridge/add-on bound to loopback.

## Initial actions

```text
blender.scene.inspect
blender.scene.render
blender.object.list
blender.object.create
blender.object.transform
blender.material.list
blender.material.apply
blender.file.export
```

## Not enabled by default

```text
blender.python.execute
blender.shell.execute
blender.filesystem.raw
```

See `docs/11-blender-reference.md`.
