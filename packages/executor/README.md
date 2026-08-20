# packages/executor

Execution abstractions.

```ts
interface Executor {
  execute(request: ExecutionRequest): Promise<ExecutionOutcome>
}

// ExecutionOutcome = public ExecutionResult + audit-only deviceId/connectionId.
// The gateway strips attribution before returning REST or MCP output.
```

Expected implementations:

- CloudExecutor
- LocalExecutor

Cloud adapters call remote services.
Local execution dispatches through the device relay.
