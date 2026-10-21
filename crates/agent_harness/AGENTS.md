# agent_harness

## What it is

Part of agent sessions: orchestrates sandboxed coding-agent sessions end to
end — provisioning containers, speaking to each coding-agent runtime
(Claude, Codex), routing triggers to a session, and relaying ACP traffic
between the sandbox and the rest of the product.

## Start here

- `src/domain/service.rs` + `src/domain/ports.rs`: the harness service and
  the ports every runtime/container provider implements.
- `src/domain/claude.rs` / `src/domain/codex.rs`: per-runtime session setup.
- `src/outbound/sidecar.rs` + `sidecar_pump.rs`: the container sidecar
  transport that speaks `agent_runtime_protocol`.
- `src/outbound/containers.rs` / `managed_containers.rs`: container
  provisioning.
- `src/domain/trigger_router.rs`: routes an incoming trigger to a session.
- `src/inbound/kafka.rs`: trigger ingestion.

## Scope

- Owns: session lifecycle orchestration, container provisioning, runtime
  selection, MCP/tool-approval wiring for sandboxed sessions.
- Not here: session state/persistence → `agent_session`; credential
  stamping for sandbox egress → `agent_egress`; the ACP wire protocol →
  `agent_runtime_protocol`.

## Boundaries

- Depends on: `agent_session`, `agent_egress`, `agent_runtime_protocol`,
  `agent_trigger`, `ai_billing`.
- Used by: `agent_harness_service` (its sole host).

## Recipes

- Add a new runtime: `src/domain/<runtime>.rs` (session setup) →
  `src/outbound/<runtime>.rs` (adapter) → `src/domain/service.rs` (dispatch)
  → `src/inbound/capability_discovery.rs` if it needs discovery.
- Add a trigger source: `crates/agent_trigger` (context) →
  `src/domain/trigger_router.rs` → `src/inbound/kafka.rs`.

External runtimes receive the session's configured MCP selection when binding,
including enabled owner connections and custom servers under `OwnerConnections`.
Use `external_mcp_servers` to preserve the host-reachable egress URL override.

External chat replies use `domain/service/external_replies.rs` and the
`agent_external_replies` journal. Macrod sends the triggering message ID as the
control action ID; the harness joins that completion to its authorized reply
origin, regardless of arrival order. Recovery reads terminal results from the
original durable action history when an observer callback was lost, including
turns hidden by a later session load, and retries message updates
without re-prompting. Keep deduplication inside the serialized command worker.
Remember successful announcements. After 24 hours, recover replies without a
persisted completion at most hourly, preserving late answers after lost callbacks.
Persisted completions bypass this backoff; direct completion handling is immediate.

## Checks

- `cargo test -p agent_harness` (`SQLX_OFFLINE` unset).

## Related

- Rules: `.agents/rules/rust/architecture.md`, `.agents/rules/rust/security.md`
