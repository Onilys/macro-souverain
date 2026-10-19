# graphql_soup

## What it is

Backs the Soup feature (the app's unified entity search/home surface): the
soup-domain GraphQL wrapper types. The composed schema (root query, viewer,
SDL export) lives in `complete_graph` — see `../complete_graph/AGENTS.md` for
the schema conventions (presence-of-`id` normalized-cache rules and the
viewer pattern), which apply to every type defined here.

## Grouped pagination

`user.groupSoupDirectory` returns authorized membership counts without hydrating
entities. Its entries are embedded metadata, so they have `key`, never synthetic
`id` fields. `groupSoup(startGroup: ...)` starts one group's pages; subsequent
pages use the existing continuation cursor. Keep directory and page filters on
the same domain policy path, including favorites and CRM scope resolution.

## Gotchas

- `SoupItemLoader` (single-entity lookups, `soupUpdates` hydration) resolves
  email threads through entity-access view receipts, the rule the REST thread
  route applies, not through the viewer's inbox scope; Soup's email leg only
  serves lists. A thread shared through a team's CRM, a project, or a share
  therefore opens through `emailThread` even though it lives in a teammate's
  inbox.
