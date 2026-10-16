-- What each imported item is in its source system, the tree it was imported
-- as part of, and the review that approved it. `kind` stays nullable until
-- every writer sets it; NULL reads as the source's original kind (Linear
-- issue, Notion page, Slack channel).
SET LOCAL lock_timeout = '5s';

ALTER TABLE import_entity
    ADD COLUMN kind TEXT,
    ADD COLUMN parent_id UUID REFERENCES import_entity (id) ON DELETE CASCADE,
    ADD COLUMN review_id UUID REFERENCES agent_session_review (id) ON DELETE SET NULL;

UPDATE import_entity
SET kind = CASE source
    WHEN 'linear' THEN 'issue'
    WHEN 'notion' THEN 'page'
    WHEN 'slack' THEN 'channel'
END
WHERE kind IS NULL;

ALTER TABLE import_entity ADD CONSTRAINT import_entity_kind_check CHECK (
    kind IS NULL
    OR (source = 'linear' AND kind IN ('issue', 'project', 'document'))
    OR (source = 'notion' AND kind IN ('page', 'database', 'data_source', 'row'))
    OR (source = 'slack' AND kind = 'channel')
);

-- One Macro copy per team for each Notion or Linear object: the first
-- teammate to claim an object (`importing`) or finish it (`imported`) owns
-- it, and later importers link to that copy. Existing Notion and Linear rows
-- never set team_id, so this cannot conflict with current data. Slack keeps
-- its own reservations in import_target_reservation.
CREATE UNIQUE INDEX import_entity_team_object_key
    ON import_entity (source, team_id, foreign_id)
    WHERE team_id IS NOT NULL
      AND source IN ('notion', 'linear')
      AND status IN ('importing', 'imported');

CREATE INDEX import_entity_parent_idx ON import_entity (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX import_entity_review_idx ON import_entity (review_id) WHERE review_id IS NOT NULL;
