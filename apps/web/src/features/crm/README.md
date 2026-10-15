# CRM ownership

CRM company and contact screens, settings, filters, saved views, lists, import,
export, and company actions belong here. The dependency rules are enforced by
`architecture.test.ts` and the feature rules in `rules/ast-grep`.

```text
crm/
  core/         Domain types, permissions, stage resolution, CSV and view validation
  context/      Explicit source/action contracts and scoped providers
  queries/      CRM query factories, cache updates, transport decoding
  primitives/   Reactive workflows: board, filters, stages, views, import, export
  components/   Props-driven presentation and column definitions
  views/        Screens composed from context, primitives, and components
  tests/        Cross-layer CSV integration coverage
  crm.tsx       Company workspace composition
  crm-company.tsx / crm-contact.tsx / crm-settings.tsx
  crm-create.tsx / crm-link.tsx
  crm-actions.ts / crm-hide-action.ts / crm-action-items.ts / crm-user-action.tsx
  crm-search.ts / crm-tool-renderers.tsx
  route.tsx     Authenticated route and shared-view decoding
  *-adapter.*   Production sources, navigation, persistence, download, collection wiring
```

App code imports explicit entry points at this directory's root. It must not
import `views`, `primitives`, `queries`, `components`, `core`, or `context`
directly. Avoid adding a catch-all barrel that obscures these entry points.

The root adapters construct production dependencies. `context` defines the
capabilities; it does not import their implementations. Views consume these
capabilities, primitives receive narrow inputs, and components render props.
Core modules remain independent of Solid, service clients, and app state.
UI rollout gates read `useFeatureFlag` directly where used; do not pass rollout
booleans through component props or the CRM source contract.

Shared entity representations, transport clients, property editors, and
collection mechanics remain shared. CRM owns its record queries and cache updates.
CRM supplies row/header/empty state slots, filter choices, grouping policy, and
its own collection state to the shared collection renderer. Shared collection code must not acquire CRM hooks or
CRM-specific state again.

`task-composer.ts` owns the CRM task preset: Companies/Contacts are visible,
Status remains a task default but is not initially shown. Launchers pass a
serializable composer context, so the shared composer never reads CRM state.
Record-specific contexts prefill associations and isolate drafts by record.
Embedded record details register their current breadcrumb record with the
workspace host. Global task creation captures that live identity before opening
the composer and releases it when the details close; contact launches reuse the
contact detail query to include the company without a duplicate request.

`enable-crm-activity` gates both the workspace activity tabs and contextual task
composition. It defaults off everywhere and can be overridden locally with
`VITE_ENABLE_CRM_ACTIVITY=true`. Off hides activity navigation and skips activity
queries; saved activity links wait for flag loading, then fall back to Companies.
The standard record task action still associates the task with its record.
The Soup and email SQL optimizations are independent of this frontend gate.

The workspace activity feeds are CRM-linked, not unfiltered app shortcuts.
`queries/activity.ts` loads all authorized companies and contacts before
building the feed filters; the capped Quick Access suggestions are not a
complete scope. Notes means Markdown documents excluding task, snippet, and
skill subtypes. Email uses the viewer's mailbox, without team-scope widening.
This reuses existing endpoints without a schema change. Keep the scope complete:
never cap association IDs or fall back to an unfiltered feed. The activity query
memoizes its large filter AST between scope/tab changes. SQL generation batches
OR-ed references into set-membership predicates rather than emitting thousands
of separate subqueries. Email similarly batches participant lists with identical
sender/recipient roles in both candidate and message queries, and omits exact
addresses already covered by a company domain. These backend optimizations must
be deployed to resolve large-scope request stalls.

When changing behavior, test the responsible primitive or pure function. When
moving behavior, retain query keys, persistence keys, mutation ordering, loading
boundaries, routes, and markup. Run CRM tests plus affected shared collection and
user-card tests, TypeScript checking, `just check`, and the real CRM browser flows.
