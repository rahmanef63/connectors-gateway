# CLAUDE.md

One source of truth, no drift. Everything about how to build here lives in two
files, and this points at them:

- **[`AGENTS.md`](./AGENTS.md)** — the non-negotiable invariants, the architecture
  map, and what must never be done. Read it before changing anything.
- **[`CHECKLIST.md`](./CHECKLIST.md)** — what must be true before a real AI client
  points at a real account.

For the two questions a clone asks first:

- Adding a connector → [`docs/21-add-a-connector.md`](./docs/21-add-a-connector.md)
- Why there are two hosts → [`docs/20-vercel-template.md`](./docs/20-vercel-template.md)

## The short version

This is a security boundary, not a CRUD app. Three habits matter more than
anything else here:

1. **Environment variables are a trust boundary.** They are read in exactly one
   place per app (`apps/gateway/src/config.ts`) and shape-checked before the
   process serves traffic. Error messages name the variable, never its value.
2. **Every action is authorized per call.** Not once at connect time. A change
   that moves an authorization check earlier, or caches its result, needs a very
   good argument.
3. **An action's `risk` decides what needs a human.** R2+ enters the approval
   path. Under-classifying a destructive action is the mistake with the worst
   consequences in this repository.

Run `bun run validate` before you believe anything works.
