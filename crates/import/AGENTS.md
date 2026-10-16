# import

## What it is

Belongs to AI chat and Settings: the import pipeline tracking external items
(Linear issues, Notion pages, Slack channels) as they're discovered,
accepted, and copied into Macro entities. Host-agnostic — chat tools,
Settings → Slack discovery, and the Slack archive import drive the same
primitives, distinguished only by the `initiator` recorded on each row.

Not to be confused with `crates/foreign_entity`: foreign entities stay live in
the external system; an `ImportEntity` here is a ledger row for an item being
copied in, moving `staged` → `importing` → `imported` (or `discarded`). Rows
carry their source `kind`, an optional `parent_id` (the row they were imported
under), and an optional `review_id`; a team keeps one `importing`/`imported`
row per Notion or Linear object (`import_entity_team_object_key`).

## Start here

- `src/domain/models.rs`: `ImportEntity` and its state machine — read the
  module doc comment for the staged/importing/imported/discarded distinction.
- `src/domain/service.rs` + `src/domain/service/admission.rs`: Slack
  discovery, staging, and acceptance logic.
- `src/outbound/mcp_slack_source.rs`: Slack discovery via MCP tool calls, with
  `fixtures/*.json` backing its tests.
- `src/inbound/toolset.rs`: the AI-chat-facing import tools.
- `src/inbound/axum_router.rs`: the `/import/*` routes (state, accept/decline,
  Slack discovery).

## Scope

- Owns: the import ledger, Slack discovery, admission logic, and the AI-chat
  and HTTP entry points into it.
- Not here: live references to external items that never get copied in →
  `crates/foreign_entity`.

## Boundaries

- Depends on: `ai_toolset`, `ai_usage`, `ai_billing`, `connection_gateway_client`,
  `mcp_select`, `properties`.
- Used by: `ai_tools`, `slack_integration`, `services/document_cognition_service`.

## Recipes

- Add an import source: `src/outbound/<source>.rs` (implement the source port)
  → `src/source_binding.rs` → `src/domain/service.rs`.
- Add a toolset action: `src/inbound/toolset.rs` → `src/domain/service.rs`.
- Add a route: `src/inbound/axum_router.rs` → `src/domain/service.rs`.

## Checks

- `cargo test -p import` (`SQLX_OFFLINE` unset).

## Related

- Rules: `.agents/rules/rust/architecture.md`
- Skill: `cloud-storage-hexagonal-architecture`
