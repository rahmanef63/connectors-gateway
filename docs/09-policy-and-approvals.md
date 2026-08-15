# Policy and approvals

## Purpose

Prevent a valid AI session from automatically gaining unlimited capability.

## Evaluation

```text
caller
+ user/workspace
+ connector
+ action
+ device
+ action risk
+ scopes
+ user policy
= decision
```

Possible decisions:

```text
ALLOW
DENY
REQUIRE_APPROVAL
```

## Example policy

```yaml
connector: blender
rules:
  - action: scene.inspect
    decision: allow

  - action: scene.render
    decision: allow

  - action: object.delete
    decision: require_approval

  - action: python.execute
    decision: deny
```

## Local enforcement

The local agent should also maintain an effective local allowlist.

Example:

```text
Cloud policy says: ALLOW python.execute
Local device says: DISABLED
Result: DENY
```

The most restrictive decision wins.

## Approval UX

MVP can support approval in the web dashboard. Later versions may support push notifications or desktop prompts.

Never fake a read-only annotation to bypass host confirmation UX.
