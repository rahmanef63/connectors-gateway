# apps/web

User-facing control plane.

## MVP screens

```text
/
├── connections
├── devices
├── permissions
├── approvals
├── audit
└── setup
```

### Connections

Shows cloud service connections and status.

### Devices

Shows paired local machines, online state, detected local adapters, and revoke/disconnect controls.

### Permissions

Allows users to control connector/action risk policies.

### Approvals

Handles `REQUIRE_APPROVAL` decisions.

### Audit

Shows who/what executed which action and where.

### Setup

Provides copy-ready configuration for connecting AI clients to the gateway.
