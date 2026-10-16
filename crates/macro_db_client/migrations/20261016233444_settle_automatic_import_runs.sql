-- Onboarding no longer imports automatically, so nothing will finish a run
-- that was mid-import when the new code deployed. Settle those runs so Slack
-- discovery, which only restarts terminal runs, can start again. Rows the
-- import left `importing` are reset by the service's stale-import reaper.
SET LOCAL lock_timeout = '5s';

UPDATE import_run
SET status = 'completed', updated_at = NOW()
WHERE status = 'importing';
