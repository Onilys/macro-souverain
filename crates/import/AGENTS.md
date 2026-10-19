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

Notion workspace imports go through a reviewed plan: `ImportFromNotion`
(`plan`) reads the workspace over Notion's REST API (`import_notion`, through
the user's Pipedream grant), asks the decision model what to do with each page
and data source (copy, tasks, skip, or by hand), and stages the plan as ledger
rows. The agent presents it with `PresentReview` (kind `import`); the harness
ties the rows to the review (`review_id`) and, on approval, starts the write:
folders mirroring the page tree, documents, databases with rows, row bodies and
relations, and task lists as Macro tasks. The Notion run row tracks it
(`running` → `ready` → `importing` → `completed`/`failed`/`dismissed`).

## Start here

- `src/domain/models.rs`: `ImportEntity` and its state machine — read the
  module doc comment for the staged/importing/imported/discarded distinction.
- `src/domain/service.rs` + `src/domain/service/admission.rs`: Slack
  discovery, staging, and acceptance logic.
- `src/outbound/mcp_slack_source.rs`: Slack discovery via MCP tool calls, with
  `fixtures/*.json` backing its tests.
- `src/domain/service/notion_workspace.rs` (+ `plan`, `triage`, `write`,
  `values`): the Notion workspace import — planning, the decision model,
  writing, cancel and the report.
- `src/inbound/toolset.rs`: the AI-chat-facing import tools
  (`toolset/import_from_notion.rs` is the workspace import tool).
- `src/inbound/axum_router.rs`: the `/import/*` routes (state, accept/decline,
  Slack discovery, the Notion import report and cancel).

## Scope

- Owns: the import ledger, Slack discovery, admission logic, and the AI-chat
  and HTTP entry points into it.
- Not here: live references to external items that never get copied in →
  `crates/foreign_entity`.

## Boundaries

- Depends on: `ai_toolset`, `ai_usage`, `ai_billing`, `connection_gateway_client`,
  `mcp_select`, `properties`, `import_notion` (Notion REST), `models_databases`
  (database ops the workspace import writes).
- Used by: `ai_tools`, `slack_integration`, `services/document_cognition_service`,
  `services/agent_harness_service` (import reviews).

## Recipes

- Add an import source: `src/outbound/<source>.rs` (implement the source port)
  → `src/source_binding.rs` → `src/domain/service.rs`.
- Add a toolset action: `src/inbound/toolset.rs` → `src/domain/service.rs`.
- Add a route: `src/inbound/axum_router.rs` → `src/domain/service.rs`.

## Checks

- `cargo test -p import` (`SQLX_OFFLINE` unset).

## Gotchas

- Workspace imports write through the host's `WorkspaceWriter` (the
  `ai_tools` entity creator), which also implements `EntityCreator`; the
  import service's `N` type parameter is the Notion connection factory, and
  hosts that never call `.with_notion_connections` report Notion as not
  connected.
- Planning and writing run detached (`tokio::spawn`) with a heartbeat on the
  run row; a cancel from any process flips the run to `dismissed` and the job
  stops at its next check.

## Related

- Rules: `.agents/rules/rust/architecture.md`
- Skill: `cloud-storage-hexagonal-architecture`
