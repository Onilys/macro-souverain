-- A discussion can move to another parent, as when a task becomes a project.
-- Moving the messages carries their thread rows with them. Added without
-- scanning existing threads under the DDL lock; validated separately.
SET LOCAL lock_timeout = '5s';

ALTER TABLE comms_message_threads
    DROP CONSTRAINT comms_message_threads_root_fkey,
    ADD CONSTRAINT comms_message_threads_root_fkey
        FOREIGN KEY (root_id, parent_entity_type, parent_entity_id)
        REFERENCES comms_messages (id, parent_entity_type, parent_entity_id)
        ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
