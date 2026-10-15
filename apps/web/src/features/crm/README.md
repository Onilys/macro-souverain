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

When changing behavior, test the responsible primitive or pure function. When
moving behavior, retain query keys, persistence keys, mutation ordering, loading
boundaries, routes, and markup. Run CRM tests plus affected shared collection and
user-card tests, TypeScript checking, `just check`, and the real CRM browser flows.
