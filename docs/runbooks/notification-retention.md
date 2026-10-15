# Notification retention

The internal `notification_retention_handler` Lambda removes notifications older
than 30 complete UTC days. Its EventBridge schedule is **disabled** in both dev
and prod, and its event payload defaults to **dry-run**. Deploying the code or
migrations alone does not purge history.

## Semantics

- The cutoff is the database clock at invocation start minus 30 days, converted
  to UTC for the schema's timezone-less `notification.created_at` column.
- Delete only parents with `created_at < cutoff`. Equality and newer timestamps
  survive. Reading, completing, reopening, or sending does not extend retention.
- All recipient states (`unseen`, `seen`, `done`) and soft-deleted recipients
  expire with the parent. The parent age wins even if recipient timestamps differ.
- Foreign keys cascade to `user_notification` and `notification_message_receipt`.
  Messages, documents, other source entities, preferences, unsubscribe records,
  device registrations, and email-send bookkeeping are not removed.
- Old unread notifications disappear. Items whose only feed-placement reason was
  an expired notification may disappear from that feed, not from source storage.
- This is eventual cleanup, normally within a five-minute schedule interval plus
  execution time after expiry once caught up. Backlogs, failures, or locked rows
  can extend that delay. There is no new read-time expiration filter.
- **Replay protection is intentionally out of scope.** Parent-row existence still
  provides notification-ID deduplication. After retention deletes a parent, an
  old event replay can recreate it with a fresh timestamp. Do not assume forever
  idempotency when replaying old ingress events.

## Execution and safety limits

The notification domain owns policy and batching in
`crates/notification/src/domain/retention.rs`. Its outbound adapter owns checked
SQL and transactions in `crates/notification/src/outbound/retention.rs`. The
Lambda only parses an internal event, computes remaining invocation time, and
calls the domain service. There is no HTTP route or user-callable cleanup API.
IAM controls invocation; do not grant end users permission to invoke this Lambda.

Each invocation:

1. Computes one cutoff using the database clock and previews at most 100 expired
   parents. `sampled_expired` is **not** a total backlog count.
2. In deletion mode, selects oldest-first using `(created_at, id)`, at most 100
   parents per transaction. A matching B-tree index avoids a history-wide sort.
3. Acquires a nonblocking transaction-scoped advisory lock, then uses
   `FOR UPDATE SKIP LOCKED`. Another cleanup transaction causes this invocation to
   stop. Locked parents are retried on future invocations; there is no watermark
   that could permanently skip them.
4. Deletes parents, allowing ordinary FK cascades and delete triggers, and commits
   each batch. No recipient payloads are returned to the worker.
5. Pauses 250 ms between batches. Caps work at 100 attempted batches and a
   100-second invocation budget, leaving 15 seconds of headroom before starting
   another batch. The Lambda timeout is 120 seconds and remaining Lambda time is
   also respected.

The dedicated pool has one connection and a five-second acquisition timeout.
Statements time out after five seconds and lock waits after one second. Idle
transactions time out after ten seconds, so a stalled/frozen worker cannot hold
locks indefinitely. The handler also bounds the entire call by its remaining
invocation budget, including pool/network waits. A delete
statement/lock timeout rolls back that batch; the service halves the next batch
size. A timeout at one parent fails the invocation and raises the error alarm.
Other errors also fail, without undoing previously committed batches. A subsequent
invocation resumes naturally. Lambda concurrency is one; the advisory lock also
protects against other instances of this worker.

Parent limits do not bound recipient/receipt fanout. A single huge notification
can still exceed the timeout and require operator investigation. Never raise
limits or disable constraints/triggers merely to force progress.

## Realtime effects

The existing parent-delete trigger publishes `user_notification_deletes` events
before recipients cascade away. The migration splits recipients into JSON chunks
with a 7000-byte recipient-array budget, leaving room below PostgreSQL's 8000-byte
NOTIFY limit. Existing consumers accept the same event shape for each chunk.
An individual malformed/oversized recipient is warned about and skipped; a
publication failure remains best-effort, as in the previous trigger.

`LISTEN/NOTIFY` is not durable. Disconnected clients/listeners must reconcile on
refetch/reconnect; this change does not add durable tombstones or an outbox.
Watch notification-service/Kafka/connection-gateway load during backfill. Do not
turn off delete events to speed up the purge.

## Rollout

Production deletion needs explicit approval and a verified backup/PITR recovery
procedure. Do not run a historical `DELETE` inside a migration.

1. Apply the additive migrations through the normal approved database workflow.
   The retention index is built concurrently in its own nontransactional
   migration; the other migration replaces the delete-event function without
   changing its contract. Verify the index is valid. If a concurrent build fails,
   inspect its invalid index and repair/retry under the database deployment
   procedure rather than marking the migration successful.
2. Deploy the notification-service stack. Its deployment configuration also builds
   the new Lambda. Keep `notification_retention_enabled: false` and
   `notification_retention_dry_run: true` initially.
3. Inspect age distribution, recipient/receipt fanout, and query plans against
   representative data. Use plain `EXPLAIN` for production deletion plans;
   `EXPLAIN ANALYZE DELETE` actually deletes data.
4. Enable the schedule **in dry-run mode** first:

   ```bash
   \cd infra/stacks/notification-service
   pulumi config set notification_retention_enabled true --stack <dev-or-prod>
   pulumi config set notification_retention_dry_run true --stack <dev-or-prod>
   # Review/apply through the normal deployment workflow.
   ```

5. After approval and reviewing dry-run logs, change
   `notification_retention_dry_run` to `false` and deploy. Drain existing history
   with these same bounded batches; do not substitute a bulk deletion. Initial
   capacity is at most 10,000 parents per invocation (usually less). Verify
   steady-state capacity exceeds incoming expiration volume before enabling prod.
6. Monitor application latency, database CPU/I/O, WAL and replica lag, dead tuples,
   vacuum progress, NOTIFY warnings/queue pressure, and realtime consumer lag.
   Pause the schedule on unacceptable impact. Do not automatically run
   `VACUUM FULL`; ordinary vacuum reclaims space for reuse, not necessarily for
   returning to the filesystem.

A manual invocation with `{}` or `{"dry_run": true}` is read-only.
`{"dry_run": false}` explicitly opts into deletion. Unknown fields, alternate
spellings, and nonboolean settings are rejected. Invocation cannot override the
retention period or batch caps.

## Monitoring and stopping

Infrastructure alarms on Lambda errors, throttles, and no invocations for
15 minutes while the schedule is enabled. Each sweep logs the cutoff,
`sampled_expired`, `oldest_expired_at`, committed parent `deleted` count,
attempted `batches`, and stopping reason. Each committed batch is also logged,
so partial progress remains visible if a later batch fails.

Track `cutoff - oldest_expired_at` as expiration backlog age. During backfill it
should trend downward; once caught up, sustained growth indicates insufficient
capacity, long-lived locks, or a failing high-fanout parent. A zero-row batch can
mean rows were locked, not necessarily that every expired row has been removed.
Do not run a full `COUNT(*)` over the backlog every five minutes.

Disable `notification_retention_enabled` and deploy to stop future scheduled
invocations. An already-running invocation may still commit batches. Emergency
operational controls may also stop future invokes; they do not undo commits.
Disabling the worker or rolling back migrations **cannot restore deleted data**.
Recovery requires the approved backup/PITR process.

Retention bounds age, not cardinality. Busy users can still have many notifications
within 30 days; pagination of currently unbounded consumers remains separate work.

## Local verification

Run from the repository root with local PostgreSQL and `SQLX_OFFLINE` unset:

```bash
cargo test -p notification -p notification_retention_handler -- --test-threads=8
nix develop --command just prepare_db
just check
\cd infra
bunx tsc --noEmit --project stacks/notification-service/tsconfig.json
```

Tests cover cutoff boundaries, parent-vs-recipient age, all states, cascades,
read-only previews, deterministic bounded ordering, retry behavior, skipped locks,
transaction advisory locking, timeout rollback, non-UTC sessions, byte-bounded
multi-recipient delete events, invocation caps, and fail-closed event parsing.
