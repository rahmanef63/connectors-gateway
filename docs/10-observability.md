# Observability

## Audit events

Every execution should produce an audit record.

Minimum fields:

```text
request_id
timestamp
actor
user/workspace
connector
action
executor_type
device_id? 
connection_id?
policy_decision
status
latency
error_code?
```

Do not log:

- passwords;
- bearer tokens;
- OAuth refresh tokens;
- device credentials;
- raw sensitive payloads unless explicitly redacted and justified.

## Metrics

Useful MVP metrics:

- requests by connector/action;
- success/error rate;
- p50/p95 latency;
- local device online count;
- relay reconnect count;
- policy denial count;
- approval count;
- timeout rate.

## Tracing

A single request id should follow:

```text
AI request
→ gateway
→ router
→ relay/cloud executor
→ adapter
→ external/local app
→ result
```
