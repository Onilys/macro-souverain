-- Onboarding no longer gathers or imports automatically.
--
-- Settle runs it left mid-import: nothing will finish them, and Slack
-- discovery only restarts terminal runs. Remove the candidates it staged and
-- nobody reviewed, as onboarding completion used to; never-reviewed is not
-- declined, so chat or Slack discovery can stage them again. Rows it left
-- `importing` are reset by the service's stale-import reaper.
SET LOCAL lock_timeout = '5s';

UPDATE import_run
SET status = 'completed', updated_at = NOW()
WHERE status = 'importing';

DELETE FROM import_entity
WHERE initiator = 'onboarding' AND status = 'staged';
