-- The routine whose run created the session, so routine runs can stay out of
-- Home and the default Agents list and skip routine "finished" notifications.
-- No foreign key: the column records provenance, which stays true after the
-- routine is deleted, and routines live in the scheduled-action service.
SET LOCAL lock_timeout = '5s';
ALTER TABLE agent_session ADD COLUMN IF NOT EXISTS routine_id UUID;
