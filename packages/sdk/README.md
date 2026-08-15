# packages/sdk

Developer-facing helpers for writing adapters.

Future example:

```ts
defineConnector(...)
defineAction(...)
defineCloudAdapter(...)
defineLocalAdapter(...)
```

Keep the initial SDK thin. Do not build a large framework before two connectors prove the API.
