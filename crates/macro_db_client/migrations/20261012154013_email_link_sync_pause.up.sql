-- Set while the retention sweep has paused an idle link's sync. A paused link
-- also has is_sync_active = false, so every sync path that gates on that flag
-- skips it; this column tells a retention pause apart from a link being torn down.
ALTER TABLE email_links ADD COLUMN sync_paused_at TIMESTAMPTZ;

-- Last time someone who can access the link opened the app. The default is
-- evaluated once here, so existing links start a full retention window at
-- deploy time, and new links start it at creation.
ALTER TABLE email_links ADD COLUMN last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
