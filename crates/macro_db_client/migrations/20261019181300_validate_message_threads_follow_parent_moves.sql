-- Validate after the initial DDL transaction releases its stronger locks.
-- This scan allows concurrent message reads and writes.
SET LOCAL lock_timeout = '5s';

ALTER TABLE comms_message_threads
    VALIDATE CONSTRAINT comms_message_threads_root_fkey;
