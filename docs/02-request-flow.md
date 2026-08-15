# Request flow

## Example: render Blender scene

User asks ChatGPT:

> Render the active Blender scene using the main camera.

### Flow

```mermaid
sequenceDiagram
    participant U as User
    participant GPT as ChatGPT
    participant GW as Gateway
    participant P as Policy
    participant R as Device Relay
    participant A as Local Agent
    participant B as Blender

    U->>GPT: Render active scene
    GPT->>GW: blender.scene_render(...)
    GW->>P: authorize action
    P-->>GW: allowed / approval required
    GW->>R: dispatch job to device
    R->>A: signed job envelope
    A->>A: verify signature + permission
    A->>B: localhost command
    B-->>A: render result
    A-->>R: result metadata/file
    R-->>GW: normalized result
    GW-->>GPT: structured result
    GPT-->>U: render completed
```

## Example: CareerPack cloud action

```mermaid
sequenceDiagram
    participant GPT as ChatGPT
    participant GW as Gateway
    participant P as Policy
    participant C as CareerPack

    GPT->>GW: careerpack.application_create(...)
    GW->>P: authorize action
    P-->>GW: allowed
    GW->>C: authenticated remote request
    C-->>GW: result
    GW-->>GPT: normalized result
```

## Router decision

```text
connector.executor == "cloud"
    → CloudExecutor

connector.executor == "local"
    → LocalExecutor
    → resolve device
    → DeviceRelay
```

The AI should not branch on this distinction.
