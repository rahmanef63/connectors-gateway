# Local agent protocol

## Purpose

Provide a secure bidirectional job channel between the cloud gateway and software running on a user's machine.

## Connection lifecycle

1. Agent loads device credential.
2. Agent connects outbound to the relay.
3. Relay authenticates device.
4. Agent announces supported adapters and versions.
5. Relay marks device online.
6. Jobs are delivered only for allowed connectors.
7. Heartbeats maintain presence.
8. Disconnect marks the device offline.

## Job envelope

Conceptual shape:

```json
{
  "id": "job_...",
  "issued_at": "2026-08-15T08:00:00Z",
  "expires_at": "2026-08-15T08:00:30Z",
  "connector": "blender",
  "action": "scene.render",
  "input": {},
  "request_context": {
    "user_id": "usr_...",
    "workspace_id": "wrk_..."
  },
  "signature": "..."
}
```

Do not let the AI supply `user_id`, `workspace_id`, device id, or policy fields directly.

## Agent response

```json
{
  "job_id": "job_...",
  "status": "success",
  "output": {},
  "files": [],
  "error": null,
  "timing_ms": 932
}
```

## Reliability

MVP requirements:

- request id;
- expiration;
- replay protection;
- timeout;
- cancellation;
- structured error;
- reconnect;
- heartbeat;
- idempotency field for actions that support it.

Queueing jobs for offline devices is optional for MVP. Prefer returning `DEVICE_OFFLINE` first.
