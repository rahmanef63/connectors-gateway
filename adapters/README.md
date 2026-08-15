# adapters

Connector-specific implementations.

## Rule

An adapter translates normalized connector actions into the target application's actual API/protocol.

It should not own:

- user authentication to the gateway;
- global policy;
- device pairing;
- global audit storage.

## Initial adapters

```text
blender/      local
careerpack/   cloud
```
