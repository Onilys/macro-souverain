# Macro mascot: implementation handoff for macro-2

Implement the mascot designer and runtime in this repository using the attached working prototype as the behavioral reference. Rebuild the UI in Macro's own components and visual language. Preserve the rendering and animation math. The result should be a native Variant designer, a state-machine player/debug view, and a small integration into active agent chats.

## Start with the supplied code

The bundle is a standalone ES-module project, not an installed dependency. Read `README.md`, `docs/CONTRACT.md`, and `docs/INTEGRATION.md`. Run `node --test tests/*.test.mjs` from its root. Serve the bundle with a static HTTP server and inspect `demo/` and `reference-ui/`. The current authored Variant and a matching freshly baked sheet are in `fixtures/current/`. Prefer this project over `starter-project.json`, which is just an untouched starting point.

Folders:

- `core/model.js`: pure project creation, validation, v1 migration, transforms, world-space head rotation, eye expressions, interpolation, procedural clip generation, layout.
- `authoring/renderer.js`: established WebGL2 SDF renderer. This belongs only in the designer/baker.
- `authoring/export.js`: transparent supersampled PNG/WebP baking, shared camera fit, clipping checks, manifest and ZIP. Its player-source fetch is module-relative so it works outside the original route.
- `authoring/zip.js`: dependency-free ZIP writer.
- `authoring/number-scrub.js`: prototype number drag/edit transaction behavior; reuse behavior with native Macro primitives rather than copying DOM construction.
- `runtime/machine.js`: DOM-free, deterministic state machine and manifest validation.
- `runtime/player.js`: Canvas 2D adapter, asset sharing, visibility suspension, live reduced-motion preference, cleanup.
- `runtime/agent-adapter.js`: proposed agent-state mapping and transient completion policy. This is an adapter example, not live backend wiring.
- `reference-ui/`: complete current designer for interaction comparison. It is not the UI to ship.
- `authoring/sprite-player.js` and `reference-ui/sprite-player.js`: older direct clip player used by the existing bake ZIP. The new state-machine runtime is the production starting point; replace the ZIP player packaging during the port rather than shipping both APIs as peers.

No third-party runtime libraries are needed by this bundle. The renderer and math were authored for this project. The character fixture is the user's own current design, not an OpenAI pet asset. Do not import the external Pets reference sheet.

## Repository context already inspected

The checkout is `/Users/seamusedson/Documents/macro-2`. Read its current `AGENTS.md` / `CLAUDE.md`, `apps/web/AGENTS.md`, `docs/STYLE_GUIDE.md`, and `docs/FRONTEND_FEATURE_ARCHITECTURE.md` before editing. Recheck paths and contracts; these observations describe the checkout at handoff time.

- Frontend is `apps/web`, using Solid, Bun, existing semantic theme tokens, and Kobalte primitives. Do not build a React island.
- `packages/machine/README.md` describes `@macro-inc/machine` and its Solid adapter. Reuse it for the native controller if it fits. Preserve the supplied deterministic transition tests when porting the sequencer.
- `apps/web/src/lib/core/agent-session/session-turn.ts` explicitly identifies the fold's `turn` as the authority for whether the agent is working. `use-session-turn.ts` is the reactive entry point to inspect.
- `apps/web/src/lib/service-clients/service-agent-fold/generated/types.ts` defines `TurnState`: `idle`, `starting`, `running`, `stopping`, `blocked`, `disconnected`. Do not edit generated types.
- `apps/web/src/features/block-agent/context/AgentSessionContext.tsx` and `state/live-turn.ts` are candidates for the active session adapter. `state/session-status.ts` projects metadata for the existing status pill.
- `apps/web/src/features/block-agent/component/AgentSplitHeader.tsx` is a candidate active-chat mount point. Inspect current ownership and layout before choosing the final placement.
- `apps/web/src/features/agents-view/components/AgentGlyph.tsx` owns `AgentIcon`/`AgentAvatar`. It preserves custom avatar images and distinguishes Macro, Cursor, and generic agents. Do not replace every provider icon or custom avatar with this mascot.
- Existing `docs/AGENT_GUIDE/ai-chat.md` documents user-visible agent behavior. Update the relevant section when actual chat integration lands.

Suggested feature structure, adapted to current repository conventions:

```
apps/web/src/features/mascot/
  core/        # typed project/manifest contracts, math, pure sequencer, policy
  primitives/  # Solid editor history, player lifecycle, controller
  components/  # presentational pose controls, compass, canvas, timeline
  views/       # Variant designer and player lab composition
  context/     # narrow asset/session capabilities only if needed
  queries/     # future persistence adapters; no queries just to animate
  index.tsx    # app-facing composition, lazy UI entry
```

Keep authoring renderer/baker out of the runtime import graph. The chat player must never import a barrel that pulls in WebGL, shaders, the editor, source recipes, or ZIP generation. Lazy-load editor and lab routes using Macro's established route conventions. Start with explicit local assets and file import/export; do not invent a new backend or storage system merely to animate a character.

## Product requirements to preserve

A Variant is the neutral three-cuboid stack and its shared material/face setup. Users design:

1. Neutral stack: each cuboid's position, rotation, scale and rounding; smooth minimum; face attachment to a selected cuboid.
2. Smile, Failure, Confused and Thinking target poses: body and per-cuboid pose offsets, independent eye expressions/blinks, head rotation and gaze.
3. Idle loop with 1–8 authored poses. Pose 1 is the shared neutral pose; keep that identity synchronized. Idle frames wrap around without duplicating the last endpoint.
4. World-space gradient colors, direction, rotation, span/offset, Fresnel and clay amount. The user explicitly removed AO and directional lighting; do not add them back.
5. Look range controls: head yaw/nod and eye travel from 0–4× the original distance. Do not silently cap this at the old 1× limit.
6. A square compass arranged `NW N NE / W Neutral E / SW S SE`. Center displays neutral while retaining look controls. Neutral is not a ninth exported look cell.
7. Starting logo geometry/camera can be designed separately.
8. Numeric fields support click-to-type and horizontal scrubbing, Shift for fine control, and one undo transaction per edit/drag. Undo works while the field is focused. Provide toolbar Undo/Redo plus Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, and Ctrl+Y. View selection/playback alone must not enter project history.
9. Project naming, local persistence, portable JSON save/import, version validation, and clear inline errors. Current files are project version 2; v1 migration exists.

The editor preview defaults to 512 × 512. The runtime sheet uses 256 × 256 cells. Do not confuse those resolutions.

Generated content:

- 16-frame logo ↔ neutral morph with adjustable, symmetric anticipation/overshoot. Same frames run in reverse. It is geometric anticipation, not an extra root hop. Colors change with geometry.
- Eight neutral-based compass looks, clockwise from up in 45° steps.
- Four frames neutral → each named target. Hold the final frame; reverse the same four frames to return to neutral.
- Four-frame blink: neutral → closed → half-open → neutral.
- Idle row: 1–8 authored poses, equal holds under the current contract.

The exact sheet is 8 columns × 7 rows, 2048 × 1792. Row 1–2: intro; row 3: idle; row 4: eight looks; row 5: smile/failure, four cells each; row 6: confused/thinking, four each; row 7: blink in its first four cells. Unused cells remain transparent. Use manifest rectangles, not guessed row arithmetic in consumers.

## Implement the player first

Port or wrap `MascotMachine` and `StateMachinePlayer` before rebuilding controls. The stable targets are logo, idle, smile, failure, confused, thinking and eight looks. Transitions and blink are transient states.

Required routing:

- Logo → expression: intro to neutral, then enter expression.
- Expression A → B: reverse A to neutral, then enter B.
- Any expression → logo: reverse expression, then reverse intro.
- Interrupting an expression entry reverses from its current progress; it does not jump to the endpoint or restart at neutral.
- Interrupting intro changes its direction in place. A later request can change direction again.
- Repeated identical agent events do not restart an animation.
- Newest requested target wins; do not accumulate a queue of stale emotes.
- Blink only starts at idle, finishes once started, and then routes to the newest target.
- Look cells are static and neutral-based. Requesting gaze from an expression first exits through neutral. There is no independently composited eye layer in this atlas.
- Idle may snap to its neutral first cell when starting another clip; the current atlas does not include bridges from every breathing phase. Do not pretend it supports arbitrary motion interpolation between baked images.
- Reduced motion uses stable target frames immediately. Hidden or offscreen players stop their animation clocks. Resuming must not catch up hours of missed time.
- Hold states do not run RAF continuously. Draw only when the frame changes. Release images, observers, listeners and animation frames on cleanup; guard async loading after unmount.

The standalone lab has controls for every target, compass, blink, pause/resume, rapid interruptions, and simulated agent state. Rebuild this lab in a native debug route with current/target state and event history. Keep it usable without a real agent session. Add custom sheet selection later only with manifest validation.

## Integrate into agent chats

Start with one mascot in the active Macro agent chat, adjacent to existing identity/status UI. Keep its space reserved to avoid layout shifts. Retain text status, permission buttons, and error UI as the source of actionable information; the mascot is supplementary. Keep custom avatars and third-party branding intact. Do not animate every historic message or every sidebar row.

Create a narrow adapter from existing session accessors to a pure visual policy. Suggested initial policy:

| Authoritative signal | Visual target |
|---|---|
| Starting/running/stopping | Thinking |
| Blocked or explicitly awaiting user input | Confused |
| Explicit confirmed failure | Failure |
| Idle without a new successful completion | Idle |
| Newly confirmed successful turn | Smile briefly, then idle |
| Disconnected/unknown | Idle/static with existing disconnect text preserved |

Disconnection is not proof of failure. Idle is not proof of success. Do not infer success from `running → idle`, message strings, or token arrivals. Find the actual terminal outcome and turn ID in the fold; distinguish success, cancellation, failure, and replacement. The adapter's `completedTurnId` is an integration contract, not a field already verified to exist under that name. Suppress historical completion on initial hydration; deduplicate by session and completed-turn identity. New work/error/input-required state cancels an outstanding success timer. Avoid rapid success flashes for very short operations; tune timing after observing real sessions.

Default precedence is explicit failure, then user input required, then active work, then fresh completion, then idle. Decorative gaze/blink must not override work/error states. Dispose/reset session-scoped controllers and timers when identity changes. Never create a new transcript subscription or poll just to drive the mascot; reuse the existing owner.

Use Solid effects only for syncing the imperative player. Pure visual state derives from accessors; frame time should not update the entire transcript tree. Mount outside streaming transcript content and avoid remounting on every chunk. Use `onCleanup` for player/controller disposal. Flag the host mount with Macro's existing feature-flag workflow if needed; flags belong outside the reusable component.

## Assets and persistence

Treat project JSON as editable source and the sheet/manifest as a versioned build artifact. For an initial integration, use a single bundled published fixture. Later save a variant ID + revision + content hash, and serve immutable WebP/PNG/manifest URLs atomically. Chat only needs the asset identity and visual state, not the full rig JSON. Do not persist per-frame playback state or broadcast it over realtime.

The 2048 × 1792 sheet decodes to roughly 14 MiB RGBA regardless of its small compressed size. Share one decoded sheet across mounted instances and retain it only while referenced. Small avatars should use a smaller-resolution bake in a later schema-compatible export option, not 100 simultaneous unique 256px sheets. Keep one or a few active animated instances; static posters are appropriate for lists/history. Keep failure fallback to a normal icon or neutral still image.

## Acceptance and rollout

1. Core parity: current fixture round-trips; v1 migration; exact row geometry; positive scales through overshoot; morph/expression endpoints equal neutral/target; clockwise eight-look mapping; 4× eye travel; unused alpha cells blank.
2. UI: every authored value affects the correct shared rig or selected pose; changing one expression does not mutate another; undo/redo works for typing/dragging/color changes; 1–8 idle poses enforced; compass center works; portable save/import.
3. Bake: actual browser PNG/WebP generation, cancel, clipping errors, safe resource release, frame inspector; frame map and project match the image. Preserve transparent edges and no extra shading.
4. Runtime: run all sequencer tests; add Solid mount/unmount and asset-failure coverage; test rapid target bursts, logo reversal, backgrounding, repeated statuses, reduced motion, and multiple instances sharing assets.
5. Chat: verify a real start, tool activity, blocked approval, resume, successful completion, cancellation, explicit failure, reconnect, reload, and rapid session switching. Confirm no sent prompts or session control actions originate from cosmetic state changes.
6. Performance: editor code is absent from chat's bundle; no new polling; no RAF in held/hidden states; no transcript remounts; stable layout at 32/48/64/128px.
7. Follow repo-required tests/type checks and `just check`. Update `docs/AGENT_GUIDE/ai-chat.md` only when the native user-facing integration is implemented. Report observed limits rather than claiming production integration from the lab alone.

Work in stages with runnable results: runtime + lab; native designer; active-chat adapter. Reuse this bundle's art/math and replace its prototype UI and persistence wiring with repository-owned components. Do not publish assets or deploy as part of the handoff unless separately requested.
