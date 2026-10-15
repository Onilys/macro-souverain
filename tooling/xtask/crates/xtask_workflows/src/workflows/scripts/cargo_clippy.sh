set -euo pipefail

# Mirrors run_tests.sh package selection so clippy only lints the crates this
# PR can actually affect. `all` keeps the historical workspace invocation,
# including sync_service's special-cased feature set.

packages="${RUST_PACKAGES:-}"

# Warnings fail the run here rather than through -Dwarnings (including clippy's
# disallowed_methods, a warning by default): a lint level is part of every
# crate's kache key, and laptops build without one. kache replays a cached
# crate's warnings, so a hit still reports them.
deny_warnings() {
  local log status=0
  log="$(mktemp)"
  { "$@" 2>&1 1>&3 3>&- | tee "$log" >&2; } 3>&1 || status=$?
  if grep -qE 'generated [0-9]+ warnings?' "$log"; then
    echo "error: Rust warnings are not allowed; fix the warnings above" >&2
    [ "$status" -ne 0 ] || status=1
  fi
  rm -f "$log"
  return "$status"
}

clippy_sync_service() {
  deny_warnings cargo clippy -p sync_service -- \
    -A clippy::unnecessary_map_or \
    -A clippy::collapsible_if
}

if [ -z "$packages" ] || [ "$packages" = "all" ]; then
  deny_warnings cargo clippy --workspace --all-features --exclude sync_service
  clippy_sync_service
  exit 0
fi

if [ "$packages" = "none" ]; then
  echo "No Rust packages to lint"
  exit 0
fi

sync=false
pkg_args=()
for p in $packages; do
  if [ "$p" = "sync_service" ]; then
    sync=true
  else
    pkg_args+=(-p "$p")
  fi
done

if [ "${#pkg_args[@]}" -gt 0 ]; then
  deny_warnings cargo clippy --all-features "${pkg_args[@]}"
fi

if [ "$sync" = true ]; then
  clippy_sync_service
fi
