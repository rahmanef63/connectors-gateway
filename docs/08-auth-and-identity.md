# Auth and identity

## Identity layers

Keep these identities separate:

1. Human user.
2. Workspace/organization.
3. AI client / OAuth client.
4. External service connection.
5. Local device.
6. Action execution.

## Credential types

| Credential | Owner | Storage |
|---|---|---|
| user session | user | web/session layer |
| AI OAuth token | AI client | gateway auth layer |
| SaaS refresh token | connection | encrypted server storage |
| device credential | local agent | OS secure storage |
| local app secret | local device | local secure storage |

## Rules

- Never pass SaaS refresh tokens to AI clients.
- Never pass device credentials to the model.
- Bind external connections to an explicit owner/workspace.
- Per-action authorization still runs after authentication.
- Support revoke at user, connector, connection, and device levels.

## Connection abstraction

Conceptual model:

```ts
type Connection = {
  id: string
  connectorId: string
  ownerType: "user" | "workspace"
  ownerId: string
  authType: string
  status: "active" | "expired" | "revoked" | "error"
}
```
