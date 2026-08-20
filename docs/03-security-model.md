# Security model

## Security goal

The gateway should make local software remotely usable **without turning the user's machine into a public server**.

## Default trust boundaries

```text
Internet
│
├── AI Client                untrusted input
├── Public Gateway           hardened edge
│
└── encrypted device session
     │
     └── Local Agent         trusted only for paired account
          │
          └── localhost app bridge
```

## Required controls

### Gateway

- TLS only.
- Authenticate every client.
- Bind requests to user/workspace identity.
- Authorize each action.
- Validate input against connector schema.
- Apply rate limits.
- Log action, actor, connector, device, result status, latency.
- Never return raw credentials.
- Encrypt access and renewal credentials at rest; the control plane stores ciphertext only.
- Coordinate refresh with a short lease and credential generation so concurrent gateways cannot
  reuse or overwrite a rotated refresh token.

### Local Agent

- Outbound connection only.
- Per-device credential.
- Store secrets in OS secure storage where possible.
- Verify every job envelope.
- Reject expired/replayed jobs.
- Enforce local allowlist independently of cloud policy.
- Bind application bridges to loopback.
- Provide kill switch / disconnect.
- Support credential rotation and remote revocation.

### Blender

Default-deny:

- arbitrary Python;
- shell execution;
- unrestricted filesystem;
- arbitrary network access.

Safe actions should be explicit, narrow tool calls.

## Risk classes

| Risk | Example | Default behavior |
|---|---|---|
| R0 | read scene metadata | auto-allow |
| R1 | create non-destructive object | allow if connector enabled |
| R2 | modify scene/material | configurable confirmation |
| R3 | overwrite/delete/export | confirmation |
| R4 | arbitrary code/shell | disabled by default |

## Defense in depth

A compromised gateway policy should not automatically imply unlimited local execution. The local agent maintains its own capability allowlist.

### Agent credential storage by platform

The agent separates secret device credentials from non-secret device metadata when a safe native store is available:

- Linux desktop sessions use Secret Service through `secret-tool`; the credential is supplied on stdin and the config file stores only an opaque `os:connectors-agent:v1` reference.
- Headless Linux keeps the existing owner-only `0700` directory / `0600` file fallback because a Secret Service session is normally absent.
- macOS and Windows currently keep that owner-only fallback. The common `security`/PowerShell CLI approaches would expose a credential in process arguments or require an interactive prompt, so the agent does not claim native protection until a direct Keychain/DPAPI binding is available.
- Migration is write-native-first: plaintext is removed from the file only after native persistence succeeds. A config containing an OS-store reference fails closed if that store later becomes unavailable.
