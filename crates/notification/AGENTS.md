# notification

## What it is

The notifications feature's hexagonal core. Fans a domain event out to
in-app realtime (WebSocket/Kafka), push (mobile/web), and email digests, and
manages per-item preferences, snoozing, and muting.

## How it works

A domain event arrives via HTTP, the queue worker, or the Kafka listener;
the domain service applies per-user preferences/mute/snooze state, then
dispatches to whichever outbound adapters apply (realtime fan-out, push,
digest email). State transitions and device registration are read back
through the same service.

## Start here

- `src/domain/service.rs` + `src/domain/ports.rs`: the notification policy
  and every port an adapter must implement.
- `src/inbound/http.rs`, `src/inbound/worker.rs`,
  `src/inbound/notification_events_listener.rs`: HTTP routes, the queue
  worker, and the Kafka event listener that trigger notification creation.
- `src/outbound/`: one file per channel/concern — `fanout_realtime.rs` +
  `kafka_realtime.rs` (live WebSocket fan-out), `mobile.rs` + `sns_endpoint.rs`
  (push), `email.rs` + `digest_batcher.rs` (digest emails), `repository.rs`
  (Postgres via `notification_db_client`), `item_preferences.rs` (snooze/mute).

## Scope

- Owns: notification creation, read/unread/snooze state transitions,
  per-channel delivery, and device registration.
- Not here: the lifecycle state enum itself and its transition rules →
  `notification_state`; the Postgres queries → `notification_db_client`.

## Boundaries

- Depends on: `notification_db_client`, `notification_state`, `rate_limit`,
  `macro_authorization`.
- Used by: most feature crates that need to notify a user (`properties`,
  `channels`, `reminders`, `teams`, `messages`, `calendar_events`, ...) and
  `services/notification_service`, `services/agent_harness_service`,
  `services/email_service`.

## Recipes

- Add a new delivery channel: a port in `src/domain/ports.rs` → an adapter
  under `src/outbound/` → wire it in the service in `src/domain/service.rs`.
- Add a new notification trigger: `src/inbound/notification_events_listener.rs`
  (or the relevant inbound adapter) → `src/domain/models.rs` for the event
  shape → `src/domain/service.rs`.

## Checks

- `cargo test -p notification` (`SQLX_OFFLINE` unset; needs local MacroDB).
- `cargo test -p notification --features redis-tests` for the Redis-backed
  preference paths.

## Gotchas

- Feature flags gate most adapters (`axum`, `ai_tool`, `clear_ios_push`,
  `schema`); building without the feature a caller needs silently drops the
  module instead of failing loudly — check `Cargo.toml` before assuming an
  adapter is compiled in.
- Notification payloads must not be logged on tracing spans (see the
  `fix(notification): stop recording notification payloads` history).

## Related

- Rules: `.agents/rules/rust/architecture.md`, `.agents/rules/observability.md`
