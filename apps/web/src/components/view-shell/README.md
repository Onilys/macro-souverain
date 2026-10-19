# Workspace sidebar spacing

The `--sidebar-*` tokens in `src/index.css` own sidebar geometry. Compose the
slots below instead of adding per-workspace padding or button size overrides.

| Measurement | Desktop default |
| --- | --- |
| Outer gutter / row inset | 5px / 8px |
| Icon slot / glyph | 20px / 16px |
| Control target | 24px (36px on touch) |
| Row height / gap | 32px / 2px (44px row on touch) |
| Icon-to-label gap | 6px |
| Section gap / header-to-content gap | 24px / 4px |
| Workspace title bar height | 48px |

Both rails sit `gutter + row inset + icon slot / 2 = 23px` from the sidebar edge.
The control inset is derived from that center and the control's size. Never
align trailing controls by their outer edges or offset an individual icon.

- `ViewSidebar.Primary` gives create actions and toolbars the same 8px top inset.
- `ViewSidebar.CloseButton` closes the owning split in both docked navigation and
  narrow navigation overlays. Its visibility follows the split controller, not
  the sidebar breakpoint; the last remaining list split still has no close action.
- `ViewSidebar.Toolbar` aligns its final `Control` with the right rail.
- `ViewSidebar.Content` owns outer gutters, 16px top/bottom padding, and section gaps.
- `Item` and `Action` own row spacing; use `Icon` for leading glyphs and
  `Trailing` for non-interactive trailing glyphs such as a create-menu chevron.
- `CollapsibleSection.Header` and `Action` align section controls on the same rail.
- `TreeItem` and `Branch` own disclosure positioning and the nested rail.
- Use `--sidebar-action-inset` for a trailing control beside a separate selectable
  row, as in Email's inbox list. Do not repeat numeric offsets in the workspace.

## Search and creation

Use `SidebarActionRow` to register search and creation under the feature owner.
The sidebar's first row replaces the visible title with a large, unframed creation
action, sized to show its complete label without an entity icon, background, border,
or shadow. Keep creation text at 20px with 8px horizontal button padding, a 6px chevron gap, and 8px between header controls at every sidebar width. This is followed by Search and close/collapse controls in the same 48px header.
Views without creation keep a noninteractive title with the same typography and gradient.
Always show a decorative 16px trailing chevron, including single actions and static titles.
Multiple creation choices use a dropdown.
Wrap creation menu items in `Dropdown.Group` for the standard 6px inset; never
place bare items directly against the menu surface.
Creation uses buttons, never radio semantics.
Search expands on demand; Escape hides it without losing the query.

Homepage headers use `ViewShell.TopBar workspaceActions` with title children
and a `controls` slot. `WorkspaceActions` provides the same composition for
custom headers: title left; view/filter controls and muted New right.
Main-area titles use 14px semibold text, matching document and task breadcrumbs. Editor/detail toolbars keep their own layout.

Creation takes a render function, `create={() => <MyCreateMenu />}`, so each
placement owns independent menu state under the feature context.
`SidebarCreateAction` renders a 20px semibold creation title with a pronounced
theme-aware `ink` to `ink-subtle` text gradient in the sidebar and a
compact muted New button in the main toolbar. Provide `sidebarCreate` when the
sidebar needs a different menu from the main toolbar. Explicit
`sidebarLabel` describes secondary actions such as New Project.
Use `Search [thing]` placeholders. `SidebarActionOverride` supplies subview
controls and restores the parent on exit. `useSidebarSearchFocus` reveals
navigation before focusing; `onSearch` can leave a detail view on input focus.

When navigation is collapsed or overlays the main pane, desktop topbars use a 12px left inset so the navigation toggle glyph has matching top and left spacing.

Use `CreateMenuItem` for creation menus whose choices need explanation; it shares the Tasks menu icon, text, description, and accessible-name layout. Place it in the standard `Dropdown.Group` and a 320px menu bounded by the viewport.
