# packages/auth

Identity and credential abstractions.

Owns:

- authenticated actor context;
- workspace/user ownership;
- connection credential interfaces;
- device credential interfaces;
- revoke/rotate helpers.

Does not own connector-specific OAuth implementation details unless they are genuinely generic.
