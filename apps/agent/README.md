# apps/agent

Local Connectors Agent.

## MVP responsibilities

- pair device;
- securely store device credential;
- maintain outbound authenticated connection;
- announce adapter capabilities;
- receive signed jobs;
- enforce local permissions;
- call local adapters;
- return normalized results;
- upload selected files/results;
- expose status/log UI locally if useful.

## Security

The agent is not a generic remote shell.

Do not implement arbitrary:

- shell execution;
- Python execution;
- filesystem access;

as foundational primitives.

Applications should expose narrow adapters.
