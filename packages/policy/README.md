# packages/policy

Action-level authorization and approval decisions.

Input:

- actor;
- owner/workspace;
- connector;
- action;
- risk;
- scopes;
- device capability;
- configured rules.

Output:

- ALLOW
- DENY
- REQUIRE_APPROVAL
