-- Mark sessions earlier routine runs created, so they leave Home and the
-- default Agents list too. A run's history record names the session it ran
-- in; a run still in flight has no record yet and stays as it was.
SET LOCAL lock_timeout = '5s';
UPDATE agent_session AS s
SET routine_id = r.action_id
FROM action_execution_record AS r
WHERE r.resource_id = s.id::text
  AND s.routine_id IS NULL;
