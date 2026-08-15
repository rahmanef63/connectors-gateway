# convex — control plane

Devices, pairing challenges, API keys, connections, policy rules and the audit log.

## Why the filenames here are `snake_case`

Everywhere else in this repo source files are `kebab-case`. Convex will not accept
that: a module path component may only contain alphanumerics, underscores and
periods, so `_shared/pairing-record.ts` is rejected at push time with

```
InvalidConfig: _shared/pairing-record.js is not a valid path to a Convex module.
```

The platform constraint wins. Keep new files in this directory `snake_case`.

## Two audiences, two guards

- `service/*` is called by the gateway process over HTTP with a shared service
  token. Every function takes `serviceToken` and calls `requireService` first.
- `features/*` is called by the dashboard with a signed-in user. Every function
  calls `requireUser` first and derives the user id from the session — never from
  an argument.

The gateway cannot import `_generated`, so it addresses these by string through
`makeFunctionReference`. **Renaming a `service/*` module or function silently
breaks the gateway with no type error.** Grep `apps/gateway/src/store` before you
move anything here.

## Deploying

Never run the Convex CLI by hand for a routine change — the pre-push hook deploys
on any push that touches `convex/`. The one-off bootstrap is documented in
`docs/12-deployment.md`.
