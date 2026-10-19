-- Add broadcast_from_thread column to store the thread root ID when a message
-- is a broadcast copy of a thread reply (like Slack's "Also send to channel").
-- This is only set on channel-level messages that were broadcast from a thread.

ALTER TABLE comms_messages
    ADD COLUMN broadcast_from_thread uuid REFERENCES comms_message_threads (root_id);

CREATE INDEX idx_comms_messages_broadcast_from_thread
    ON comms_messages (broadcast_from_thread)
    WHERE broadcast_from_thread IS NOT NULL;

-- Broadcast messages must be top-level channel messages (no thread_id)
ALTER TABLE comms_messages
    ADD CONSTRAINT comms_messages_broadcast_check
        CHECK (broadcast_from_thread IS NULL OR thread_id IS NULL);
