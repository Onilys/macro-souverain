# initiative_task_conversion

## What it is

Part of Tasks/Projects: the outbound adapter behind the initiative domain's
`TaskConversions` port, which turns a task into a project in place.

## How it works

`InitiativeService::convert_task` (in `crates/initiative`) drives the order.
This crate supplies the task-side steps, each through the domain that owns it:

- read: the task's identity and live check (`documents`), its property values
  and subtasks (`properties`), and its Loro body (sync-service, read with a
  60-second service grant).
- move discussions: `messages::domain::transfer`, one transaction.
- adopt subtasks: set each editable subtask's Project, clear its Parent Task.
- retire: trash the task (`documents` `TrashEntity`).

## Start here

- `src/lib.rs`: `TaskConversionAdapter` and the port implementation.
- `src/carried.rs`: which task properties a project keeps, and how a stored
  value becomes the write that recreates it.

## Scope

- Owns: the composition of task-side conversion steps.
- Not here: conversion order, compensation and the project create →
  `crates/initiative`; moving comments → `crates/messages`.

## Boundaries

- Depends on: `initiative`, `documents`, `properties`, `messages`,
  `entity_access` (all ports), `sync_service_client`.
- Used by: `services/document_storage_service`, `crates/ai_tools`.

## Checks

- `cargo test -p initiative_task_conversion`

## Gotchas

- The body is copied as a Loro snapshot, not markdown: the description keeps
  every node the task had and skips the 2000-grapheme create limit.
- Add a task-only relation to `TASK_ONLY` in `src/carried.rs`; a property a
  project rejects fails the whole conversion.

## Related

- Rules: `.agents/rules/rust/architecture.md` · Skills: `collab-surface-core`
