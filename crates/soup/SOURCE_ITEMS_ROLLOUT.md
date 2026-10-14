# Source items rollout

`source_items` is an application-maintained listing projection. `entity_access`
and the document, chat, and project tables remain authoritative. Every supported
application mutation refreshes the affected projection inside its existing
transaction through the shared `source_items` crate. There are no projection
maintenance triggers or stored procedures.

## Release order

1. **Apply schema, then deploy the application writers.** The normal deployment
   pipeline applies migrations before deploying services. The first migration
   creates the table and its read index atomically; two separate migrations build
   indexes on existing tables concurrently. Keep `SOUP_SOURCE_ITEMS_ENABLED=false`
   throughout this phase. The option defaults to false when omitted.
2. **Verify the full writer deployment has finished.** Confirm the reviewed commit
   is deployed to document storage, document cognition, chat deletion and other
   workers, and every service using the changed repositories. Drain older
   instances and in-flight jobs before reconciling. Old writers can temporarily
   leave the projection incomplete, which is why reads remain disabled.
3. **Run the application backfill against the primary.** From the reviewed revision,
   with `DATABASE_URL` supplied through the environment's normal secret handling:

   ```sh
   cargo run --release -p source_items --features cli --bin backfill_source_items
   ```

   The command uses the same transactional refresh helper as live writes. It
   scans canonical IDs and existing projection IDs, in 500-item batches. This
   both adds missing rows and removes projection rows for items hard-deleted by
   older writers during rollout. It is safe to interrupt and rerun from the
   beginning. Batches commit independently and use a 200 ms lock timeout;
   contention retries after one second. Monitor database load and replication
   lag, and resolve sustained contention before continuing.
4. **Validate before switching reads.** Run
   [ops/validate_source_items.sql](ops/validate_source_items.sql) on the primary
   and serving replicas. Both mismatch counts must be zero. This is a full audit;
   allow for its database load. Compare representative first and later pages,
   task/property filters, sharing/revocation, soft delete/restore, and hard delete
   with the old read path. Measure latency for realistic source counts and
   selective filters.
5. **Enable projection reads gradually.** Register `SOUP_SOURCE_ITEMS_ENABLED` in
   the document storage deployment configuration, then set it to true for a
   canary and restart that deployment. Monitor query latency, errors, transaction
   retries, lock waits, replication lag, and parity before expanding. Other
   `PgSoupRepo` consumers continue using item-table reads unless explicitly enabled.

This remains one PR and one schema-first release. No service predeployment or
writer downtime is required. The final backfill must follow convergence of the
writers; running it only before deployment leaves a gap for older writers.

## Consistency and recovery

Writers refresh after canonical changes and before committing. The shared helper
rejects autocommit connections and isolation levels other than READ COMMITTED.
It serializes refreshes with transaction-scoped advisory locks keyed by the stable
entity type and ID. A separate refresh statement sees the prior lock holder's
committed canonical state. Counts are recomputed rather than incremented from
requested operations, so overlapping grants and conflict no-ops remain correct.
The complete transaction rolls back if projection maintenance fails.

Bulk grant removals retain the affected IDs. Project deletion also captures and
locks recursively deleted projects before collecting inherited-grant targets;
this covers surviving items outside the deleted subtree and prevents new
foreign-key references from escaping that capture. Existing transaction retries
handle confirmed PostgreSQL deadlock/serialization aborts, at most four attempts;
connection failures and ambiguous commits are not replayed.

For a read regression, set `SOUP_SOURCE_ITEMS_ENABLED=false` and restart affected
instances. Continue maintaining the projection while investigating. Run the same
backfill to repair drift, then audit before re-enabling reads. Direct administrative
SQL or a writer that bypasses the shared helpers requires this reconciliation;
there are no database triggers to repair bypassed writes automatically.

Verify `source_items_read`, `idx_document_owner_updated_live`, and
`idx_user_history_user_type_updated_item` have both `pg_index.indisready` and
`pg_index.indisvalid` true before enabling reads. An interrupted concurrent index
build can leave an invalid index that `IF NOT EXISTS` skips. Drop only that invalid
index with `DROP INDEX CONCURRENTLY`, outside a transaction, then rerun the index
statement. Do not edit migration history.

The migrations are forward-only and do not move or delete authoritative rows.
Keep database backups/PITR and a tested restore procedure. A schema dump documents
the schema; it cannot restore deleted row data.

## Query scope and validation

The optimized path serves document/task, chat, and project candidates for
`UpdatedAt`, `ViewedUpdated`, and `ViewedAt`. `CreatedAt`, grouped listings, and
other entity types retain their existing paths. Every semantic filter and cursor
predicate must run before a per-source limit. Property row types can outlive a
subtype change, so they cannot prune current document/task kinds.

The query suite compares complete pages across filters, sorts, and mutation
fixtures after explicit reconciliation. Separate write tests verify transactional
maintenance, overlapping concurrent grants, subtype/lifecycle changes, rollback,
and cascading project deletion. The rollout test verifies that default reads work
with the projection empty and with its table absent.
