-- Scan only after the column migration commits and releases its lock.
ALTER TABLE import_entity VALIDATE CONSTRAINT import_entity_kind_check;
