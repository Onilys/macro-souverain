# meta_messaging

Owns Meta authorization, provider account lifecycle, webhook ingestion and the
adapter behind native customer messaging. Domain policy lives in `src/domain`;
`src/inbound` adapts HTTP/webhooks; `src/outbound` implements provider, encrypted
credential and database ports. DSS wires the native channel and access adapters.

## OAuth boundary

Instagram completion requires the independent browser proof returned at begin,
plus the initiating authenticated Macro team/user and current membership.
Reconnect, disconnect and import initiation require the current connector/member
or a current team admin. Recheck connector membership before new effects.
Never add a public state-only completion path. WhatsApp uses Embedded Signup.
See `docs/META_MESSAGING.md` for redirect configuration and rollout gates.

## Identity and readiness

Use connection-scoped provider aliases for late WhatsApp facts. Never derive phones
from BSUIDs or join by display names. Platform registration stays pending until
Meta confirms registration and subscription; preserve uncertain attempts and
encrypted credentials without persisting PINs. Accepted native recovery is separate
from new provider dispatch.

## Checks

- `cargo test -p meta_messaging --all-features` with SQLX_OFFLINE unset and an
  isolated migrated local database.
- DSS HTTP fixtures in `native_messaging/native/test/http/oauth.rs` exercise the
  actual domain, repository and access checks with a controlled provider.
- Regenerate the storage OpenAPI contracts when authorization DTOs change.
