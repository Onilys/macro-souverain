# Macro SDK

## What it is

The public TypeScript SDK wraps generated service clients in entity handles.
Authentication and service hosts come from `MacroClient`; permissions remain
enforced by the ordinary backend APIs.

## Start here

- `src/macro.ts`: public exports and namespace registration.
- `src/entities/entity.ts`: lazy detail reads, mutation invalidation and safe JSON.
- `src/entities/workspace/namespace.ts`: filtered activity pages and iteration.
- `src/entities/routines/`, `agents/`, `harnesses/`: automation and agent hosts.
- `src/entities/sharing/`, `messages/`: scoped access requests and message threads.
- `src/entities/databases/query.ts`: SQL statements, typed table/row references and version guards.
- `src/entities/crm/pipeline.ts`: pipeline-authorized table/row handles.
- `services.ts`, `openapi-ts.config.ts`: generated service contract inputs.

## Boundaries

- Keep handwritten behavior in `src/`; never edit `generated/` or `specs/`.
- Use existing entity handles for reads and mutations. Follow the
  [SDK rule](../../.agents/rules/sdk.md) and `add-sdk-endpoint` skill.
- `../sdk-docs/` generates the public TypeDoc reference and static docs Worker.
  Runtime-specific bundles belong to their consumer, not this package.

## Checks

Run from this directory: `bun test`, `bun run check`, `bun run coverage`, and
`bun run lint`. Coverage requires each generated endpoint to be wrapped or
explicitly classified in `src/coverage/skipped.ts`. Build output in `dist/` is
excluded from source linting.

## Gotchas

- Regenerate Rust OpenAPI and web service clients before `bun run sync-specs &&
  bun run generate`; do not copy deployed schemas over a local API change.
- Regenerate `../sdk-docs/reference` after SDK source or generated type changes;
  run that package's checks because web CI verifies the reference is current.
- `generated/agent-fold/` is not from OpenAPI: `cargo run -p agent_fold --bin
  export_types` writes it, and `foldedLog()` casts the opaque wire schema to it.
- Workspace advanced filters use the server's serialized AST names, not Rust
  enum variant names. Validate new filter examples against the real local API.
- Async iterators are lazy; `limit` is page size. Preserve filters on every page
  and do not fetch another page after the caller breaks the loop.
- Handles must serialize identity or loaded detail, never authenticated clients.
- Draft writes must select the draft's inbox with `X-Email-Link-Id`; callers
  supply plain HTML and the SDK encodes it for the draft wire contract.
- Meeting list lookup only covers the owner's newest 100 standalone meetings;
  handles seeded from invitations retain their token for refetching after writes.
- Keep access-request resolution snapshots: resolved requests leave pending lists.
- Pipeline schema reads share the parent's cache; successful op batches clear it.
- Email sends and other writes against hosted data are real actions; use mocks
  for automated SDK mutation tests.

- SQL result schemas are dynamic typed-cell unions; inspect `truncatedTables` before interpreting aggregates. Queries can write and are never retried automatically.
