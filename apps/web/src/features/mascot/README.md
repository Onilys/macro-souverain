# Macro mascot

Native Solid authoring and Canvas 2D playback of the supplied user-owned Variant.
No external Pets assets or new runtime dependencies are used.

## Local entry points

Run `PORT=3003 bun run dev` from `apps/web`, then open:

- `/app/debug/mascot-player`: all stable targets, compass, blink, pause,
  interruption burst, agent simulation, sizes, and event history.
- `/app/debug/mascot-designer`: shared rig/material, neutral and expression
  poses, 1–8 idle poses, logo, timeline, JSON import/export, local saving,
  browser bake/cancel and atlas frame inspection.

Both routes and the active-chat mount use the existing `LOCAL_ONLY` gate.
No production rollout flag or remote configuration has been created.

## Boundaries

`core/model.js` and `authoring/renderer.js` preserve the handoff's animation math
and SDF shader. Their `.d.ts` contracts expose typed inputs to native code;
`core/project.ts` validates and normalizes imported v1/v2 documents before use.
The JS implementations remain directly executable for parity checks.

`core/machine.js` is the deterministic continuous-time sequencer. It remains the
single sequencer rather than translating continuous progress into a second
transition table in `@macro-inc/machine`. The Solid lifecycle primitive owns the
imperative player's disposal. `runtime/player.js` imports only the pure machine;
chat does not import the designer, project recipes, WebGL, Zod or ZIP code.
The baker embeds those exact runtime sources in its portable ZIP.

`block-agent/state/mascot-snapshot.ts` projects the existing fold. Only the newest
confirmed agent message's `stop.kind === 'end_turn'` supplies a completion identity
(`sessionId` + numeric `turn`). `failed` is explicit failure; cancellation,
replacement, disconnect and missing stop reasons are not success. The existing
session owner supplies all data. There are no new subscriptions or polling loops.
The keyed chat adapter resets on session identity changes; only the active split
animates. Provider branding, custom avatars, statuses and actions remain intact.

The initial bundled asset is `public/mascots/current`, copied from the supplied
matching fixture. Editor saves never overwrite it. Changing this published asset
requires updating sheet and manifest together. Future immutable revision/hash URLs
and lower-resolution avatar exports remain separate work.

## Verification

From `apps/web`:

```
bun run test src/features/mascot src/features/block-agent/state/mascot-snapshot.test.ts
node --test src/features/mascot/tests/parity/*.test.mjs
bun run check
```

From the repository root: `just check`.

Tests cover original sequencing, interruption/reversal, reduced motion, shared
asset references, load failure, disposal during decode, held/hidden/offscreen
clocks, manifest geometry, migration/round-trip, positive scales, 4× gaze, neutral
identity, editor transactions and explicit completion policy. A dependency test
checks the runtime import boundary.

Browser checks exercise the native routes, focused-field undo, selector stability,
full eye range and compass center, actual PNG/WebP bake, cancellation and atlas
inspection. The local app uses real dev data. A full live-session matrix (tool
activity, approval/resume, success, cancellation, failure, reconnect and rapid
switching) still needs observation before enabling a production rollout. Success
currently waits 350 ms of observed work and holds a 1300 ms cosmetic window;
real-session tuning has not been claimed. No assets were published or deployed.
