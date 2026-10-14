# Source items rollout

`source_items` is a rebuildable listing projection. `entity_access` and the item
tables remain authoritative. The projection gives soup an index on source, item
kind, and update time while synchronous triggers keep grants and item metadata in
the same committed transaction. It does not replace authorization policy.

## Release order

1. **Deploy transaction retries first.** Deploy the prerequisite service change
   to every affected writer, including document storage and the chat deletion
   worker. Confirm old instances and in-flight jobs have drained before applying
   the projection migrations. Grant changes acquire item locks in their triggers;
   existing item-first edits can deadlock with grant-first revocations. PostgreSQL
   rolls back one participant. The prerequisite retries complete transactions on
   `40P01` and `40001`, at most four attempts, with bounded backoff. It never retries
   ambiguous connection/commit failures or repeats external cleanup.
2. **Install the table and triggers, then backfill.** Keep
   `SOUP_SOURCE_ITEMS_ENABLED=false`. Register this optional setting in each
   document storage service configuration; omitted values default to false.
   Apply the schema migration before the backfill migration. Ordinary writes
   must use READ COMMITTED, as required by the trigger locking protocol.
3. **Validate before switching reads.** Run
   [ops/validate_source_items.sql](ops/validate_source_items.sql) on the primary
   and any replica serving soup. Both counts must be zero. This is a full audit;
   allow for its database load. Exercise representative first and later pages,
   task/property filters, project sharing/revocation, soft delete/restore, and
   hard deletion. Compare returned item IDs and cursor order with projection
   reads disabled. Check latency and database load for the real source counts
   and selective filters used by the deployment.
4. **Enable projection reads gradually.** Set `SOUP_SOURCE_ITEMS_ENABLED=true`
   for a canary document storage deployment and restart it to load configuration.
   Monitor query latency, errors, retry warnings, lock waits, replication lag,
   and audit counts before expanding. Retain the old read path through rollout.
   Other `PgSoupRepo` consumers stay on item-table reads unless explicitly enabled.

The prerequisite and projection changes must be separate releases. Migrations
run before new service code, so merging both into a single release does not
protect the old writers.

## Backfill and recovery

The backfill processes 500 items per transaction, locks the item rows, and
recomputes their projection from authoritative records. Live writes use the same
item lock. A blocked batch rolls back and retries after one second; successful
batches commit independently. It uses a 200 ms lock timeout for batch work.
This avoids a long transaction over the full corpus, but hot rows can delay
completion and the write/index load still needs monitoring.

An interrupted backfill is safe to rerun: it replaces each item's projected
state rather than incrementing existing counts. Keep reads disabled until the
migration finishes successfully and the audit passes. Resolve persistent hot-row
contention instead of treating an incomplete backfill as ready.

For a read regression, set `SOUP_SOURCE_ITEMS_ENABLED=false` and restart the
affected service instances. This restores item-table queries while maintenance
continues. A read switch does not disable trigger work. If maintenance itself is
causing unacceptable write failures, keep reads disabled and remove the new
projection triggers using the reviewed schema rollback; the authoritative item
and access tables must remain intact. Reinstallation requires another backfill
and audit before reads can be enabled.

Keep database backups/PITR and a tested restore procedure for schema changes.
A schema-only dump documents the schema; it cannot recover deleted row data.
The down migrations affect only the projection and its maintenance objects.

## Scope and validation

The optimized path serves document/task, chat, and project candidates for
`UpdatedAt`, `ViewedUpdated`, and `ViewedAt`. `CreatedAt`, grouped listings, and
other entity types retain their existing paths. Every semantic filter and cursor
predicate must run before a per-source limit. Property row type can outlive a
change to document subtype, so property types cannot prune current document/task
kinds.

The integration tests compare complete paginated results with item-table reads
across filters, sorts, and mutations. The rollout test verifies that default
repositories still return authoritative records with an empty projection. The
transaction retry tests force a real item/grant deadlock and verify that both
operations complete with each effect committed once, and that ambiguous failures
are not retried.
