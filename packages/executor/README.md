# packages/executor

Execution abstractions.

```ts
interface Executor {
  execute(request: ExecutionRequest): Promise<ExecutionResult>
}
```

Expected implementations:

- CloudExecutor
- LocalExecutor

Cloud adapters call remote services.
Local execution dispatches through the device relay.
