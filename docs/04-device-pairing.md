# Device pairing

## Goal

Associate one local agent installation with one user/workspace without exposing machine credentials to the AI client.

## Recommended flow

```mermaid
sequenceDiagram
    participant A as Local Agent
    participant B as Browser
    participant G as Gateway
    participant U as User

    A->>G: request pairing challenge
    G-->>A: short-lived pairing code + verification URL
    A->>B: open verification URL
    B->>U: login + approve device
    U->>B: approve
    B->>G: approve challenge
    G-->>A: device credential
    A->>A: store credential securely
    A->>G: open authenticated outbound session
    G-->>A: device online
```

## Device record

Minimum conceptual fields:

```ts
type Device = {
  id: string
  userId: string
  workspaceId?: string
  displayName: string
  platform: "windows" | "macos" | "linux"
  status: "online" | "offline" | "revoked"
  credentialVersion: number
  lastSeenAt?: string
  capabilities: string[]
}
```

## Rules

- Pairing codes are short-lived and one-time use.
- A device credential is never shown to ChatGPT.
- Revoking a device terminates its active session.
- Device credentials should be rotatable.
- A user can rename a device without changing its identity.
- Reinstalling the agent should create a new device unless recovery is explicitly implemented.
