# packages/protocol

Wire contracts between gateway, relay, and agent.

Owns:

- job envelopes;
- heartbeat messages;
- capability announcements;
- result envelopes;
- protocol version;
- serialization validation;
- replay/expiry metadata.

Keep this independent from Blender.
