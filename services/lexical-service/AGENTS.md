# lexical-service

Status: migrating from Cloudflare Workers to ECS; `wrangler.jsonc` and
`deploy-lexical-service.yml` still deploy the old worker.

## What it is

Serves Documents: a Bun server exposing stateless Lexical document
conversions (plaintext, search/cognition preprocessing, markdown, HTML, XML)
over an internal HTTP API, used by search indexing, AI agent context, and
comment/markdown rendering. Production runs on ECS behind the gateway at
`/lexical` (`infra/stacks/lexical-service`, `docker/lexical-service.Dockerfile`).

## Start here

- `src/index.ts`: Hono app wiring every endpoint behind `x-internal-auth-key`
  middleware.
- `src/endpoints/`: one file per route (`plaintext.ts`, `search-text.ts`,
  `cognition-text.ts`/`cognition-v2.ts`, `markdown.ts`, `markdown-snapshot.ts`,
  `html.ts`, `xml.ts`, `comment-mark.ts`, `comment-only-change.ts`,
  `image-markdown.ts`, `agent-context.ts`, `agent-announcement.ts`,
  `extract-reply.ts`, `mentions.ts`).
- `src/lib/`: conversion logic the endpoints call into (`editor.ts`,
  `markdown.ts`, `html.ts`, `comment-only-change.ts`, `comment-mark.ts`,
  `sync-service.ts` client, `schemas.ts`).
- `README.md`: endpoint reference, local `.dev.vars.local` secrets, deploy commands.

## Scope

- Owns: pure/stateless transforms of a Lexical document (or markdown) fetched
  from `sync-service`; defines Lexical-editor utilities in
  `packages/lexical-core` first and binds them to a route here.
- Not here: Lexical node/editor primitives themselves → `packages/lexical-core`;
  document persistence and CRDT sync → `sync-service`.

## Recipes

- Add a conversion endpoint: utility in `packages/lexical-core` → `src/lib/`
  wrapper → new file in `src/endpoints/` → register in `src/index.ts`.
- Change the comment-grant gate: `src/lib/comment-only-change.ts` +
  `src/endpoints/comment-only-change.ts` (fails closed; needs
  `LEXICAL_SERVICE_AUTH_KEY` set before deploy).

## Checks

- `bun test test/tests.ts` and the `*.test.ts` files beside their endpoints
  (`bun test`).
- `bun run check` (`tsc --noEmit --project tsconfig.check.json`).
- `bun run plaintext|search|cognition <document-id>` against a local dev server
  (`bun run dev`, port 8931) to sanity-check an endpoint end to end.

## Gotchas

- Called only internally, authenticated by `x-internal-auth-key`
  (`INTERNAL_API_SECRET_KEY`); it also calls `sync-service` with
  `SYNC_SERVICE_AUTH_KEY`. On ECS both come from its Doppler project; locally
  from `.dev.vars.local`.
- Never deploy without explicit permission, by either path.

## Related

- Docs: `packages/lexical-core` (shared node/utility source of truth)
