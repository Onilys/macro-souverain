-- no-transaction
-- One Macro copy per team for each Notion or Linear object: the first
-- teammate to claim an object (`importing`) or finish it (`imported`) owns
-- it, and later importers link to that copy. Existing Notion and Linear rows
-- never set team_id, so this cannot conflict with current data. Slack keeps
-- its own reservations in import_target_reservation. Built CONCURRENTLY so
-- imports keep writing; IF NOT EXISTS makes a re-run after an interrupted
-- build a no-op once the index is valid.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS import_entity_team_object_key
    ON import_entity (source, team_id, foreign_id)
    WHERE team_id IS NOT NULL
      AND source IN ('notion', 'linear')
      AND status IN ('importing', 'imported');
