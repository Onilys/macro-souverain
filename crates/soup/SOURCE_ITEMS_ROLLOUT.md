# Source items rollout

`source_items` is a rebuildable listing projection. `entity_access` and the item
tables remain authoritative. The projection gives soup an index on source, item
kind, and update time while synchronous triggers keep grants and item metadata in
the same committed transaction. It does not replace authorization policy.

## Release order

First bring the target environment through this PR's base revision using its
normal rollout. All unrelated earlier migrations must already be applied before
predeploying this PR's service binaries. Keep projection reads disabled.

1. **Deploy transaction retries first from this PR.** Before merging into `main`
   or publishing a production release, use the existing migration-free
   [Deploy Service (Generic)](../../.github/workflows/deploy-service-generic.yml)
   workflow to deploy the reviewed revision to every affected writer, including
   document storage and the chat deletion worker. Its reusable service workflow
   builds and deploys the selected service without running database migrations.
   Confirm each workflow deployed the reviewed commit, and that old instances
   and in-flight jobs have drained before applying the projection migrations.
   Grant changes acquire item locks in their triggers;
   existing item-first edits can deadlock with grant-first revocations. PostgreSQL
   rolls back one participant. The writer changes retry complete transactions on
   `40P01` and `40001`, at most four attempts, with bounded backoff. It never retries
   ambiguous connection/commit failures or repeats external cleanup.
2. **Install the table and triggers, then backfill.** Keep
   `SOUP_SOURCE_ITEMS_ENABLED=false`. Register this optional setting in each
   document storage service configuration; omitted values default to false.
   The first migration installs the table, triggers, and an index on the empty
   projection atomically, commits that installation, then backfills in batches.
   The remaining two migrations build indexes on existing tables concurrently.
   Ordinary writes must use READ COMMITTED, as required by the trigger locking
   protocol.
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

This is one PR with two deployment phases. The normal `main` push pipeline
runs migrations before deploying services to dev; production releases use the
same ordering. Complete the writer-only phase in each environment before its
normal pipeline can apply these migrations. Keep the reviewed branch unchanged
while the writer deployments run; new writer changes require redeployment.
Coordinate the deployment window so an older main/release deployment cannot
replace those writers before migration. Do not run the standalone
`Migrate Macro Database` workflow for this revision during that window either.
Recheck deployed revisions immediately before merging or releasing.

A conservative inventory of enabled services whose resolved binary dependencies
include the retry implementation is listed below. Recheck this inventory if the
service configuration changes. Dispatch these service deployments from the
reviewed branch, then wait for all of them to finish and verify their commit IDs:

```sh
ROLLOUT_REF=synoet/soup-source-items-e837
ROLLOUT_ENV=dev
for service in \
  agent-harness-service agent-schedule-service authentication-service \
  calendar-service deleted-item-poller document-cognition-service \
  document-storage-service email-service search-processing-service \
  email-suppression mcp-server
do
  gh workflow run deploy-service-generic.yml --repo macro-inc/macro \
    --ref "$ROLLOUT_REF" -f service="$service" -f environment="$ROLLOUT_ENV"
done

gh workflow run deploy-pulumi-stack.yml --repo macro-inc/macro \
  --ref "$ROLLOUT_REF" -f pulumi-service-name=preview-gateway \
  -f environment="$ROLLOUT_ENV"
```

`preview-gateway` uses the existing generic Pulumi workflow because it is absent
from the service workflow's choice list; that path also deploys without database
migrations. Set `ROLLOUT_ENV=prod` for the production phase. The document-storage
service's artifact set includes `delete_chat_handler` and the Slack import
worker. Check any separately operated writers as well. Only proceed to the
normal migration-bearing rollout once the full writer set is running the
reviewed revision and old work has drained.

## Backfill and recovery

The backfill processes 500 items per transaction, locks the item rows, and
recomputes their projection from authoritative records. Live writes use the same
item lock. A blocked batch rolls back and retries after one second; successful
batches commit independently. It uses a 200 ms lock timeout for batch work.
This avoids a long transaction over the full corpus, but hot rows can delay
completion and the write/index load still needs monitoring.

An interrupted backfill is safe to rerun: a committed table means the complete
installation is already present, so the migration skips DDL and restarts the
backfill. Each batch replaces projected state instead of incrementing counts.
An installation failure before its first commit rolls back that entire phase.
Keep reads disabled until the migration finishes successfully and the audit
passes. Resolve persistent hot-row contention instead of treating an incomplete
backfill as ready.

Before enabling reads, verify `source_items_read`,
`idx_document_owner_updated_live`, and `idx_user_history_user_type_updated_item`
are present with both `pg_index.indisready` and `pg_index.indisvalid` true.
The projection index is created transactionally while its table is empty.
An interrupted concurrent build of either existing-table index can leave an
invalid index that `IF NOT EXISTS` will skip. Drop only that invalid index with
`DROP INDEX CONCURRENTLY`, outside any transaction, then rerun that migration's
`CREATE INDEX CONCURRENTLY` statement while projection reads remain disabled.
Do not edit migration history to repair an index.

For a read regression, set `SOUP_SOURCE_ITEMS_ENABLED=false` and restart the
affected service instances. This restores item-table queries while maintenance
continues. A read switch does not disable trigger work. If maintenance itself is
causing unacceptable write failures, keep reads disabled and disable only the
projection triggers in a separately reviewed maintenance operation; leave the
authoritative item and access data intact. For a full rebuild after triggers
were disabled, briefly pause affected writers, re-enable the projection triggers,
and truncate only `source_items` in the reviewed maintenance transaction. Resume
writers after it commits, then run the first migration's single `DO` statement
directly and repeat the audit before enabling reads. Clearing the projection
also removes rows for items hard-deleted while triggers were disabled. A completed
migration is recorded, so `sqlx migrate run` alone will not rerun its backfill.

Keep database backups/PITR and a tested restore procedure for schema changes.
A schema-only dump documents the schema; it cannot recover deleted row data.
These migrations are forward-only. Repair derived state without reverting
migration history or changing authoritative records.

## Scope and validation

The optimized path serves document/task, chat, and project candidates for
`UpdatedAt`, `ViewedUpdated`, and `ViewedAt`. `CreatedAt`, grouped listings, and
other entity types retain their existing paths. Every semantic filter and cursor
predicate must run before a per-source limit. Property row type can outlive a
change to document subtype, so property types cannot prune current document/task
kinds.

The integration tests compare complete paginated results with item-table reads
across filters, sorts, and mutations. The rollout test verifies that default
repositories still return authoritative records with an empty projection and
with the projection table absent, as it is during the writer deployment. The
transaction retry tests force a real item/grant deadlock and verify that both
operations complete with each effect committed once, and that ambiguous failures
are not retried.
