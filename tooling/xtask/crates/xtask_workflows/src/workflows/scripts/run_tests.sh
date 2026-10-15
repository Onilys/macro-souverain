set -euo pipefail

# --no-tests=pass: a package filter can legitimately select a crate with no
# tests; treat that as success, not nextest's default error.
# sync-service is not part of this suite, and its storage backends are mutually
# exclusive under --all-features.
#
# Package selection uses `cargo nextest run -p`, not `--workspace -E rdeps(...)`.
# The filterset only decides which tests *run* after a workspace build; `-p`
# is what keeps an unrelated crate's test binary from being compiled.
#
# `--lib --bins --tests` is safe with `--workspace` (cargo skips packages that
# lack a given target type) but fails with `-p` when any selected package has
# no lib — xtask binaries such as xtask_nextest_filter / xtask_workflows.
# Unconstrained `-p` still runs that package's tests.

: "${RUST_PACKAGES:?RUST_PACKAGES is required}"
# NEXTEST_NO_RUN=1 builds the test binaries without running them, which is how
# `just ci-prebuild` fills kache with exactly what this job compiles.
common=(--all-features --no-tests=pass --test-threads "$NEXTEST_TEST_THREADS")
if [ "${NEXTEST_NO_RUN:-}" = 1 ]; then
  common+=(--no-run)
fi

# Warnings fail the run here rather than through -Dwarnings: a lint level is
# part of every crate's kache key, and laptops build without one. kache replays
# a cached crate's warnings, so a hit still reports them.
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

if [ "$RUST_PACKAGES" = "all" ]; then
  deny_warnings cargo nextest run --workspace --exclude sync_service --lib --bins --tests "${common[@]}"
  exit 0
fi

pkg_args=()
for package in $RUST_PACKAGES; do
  [ "$package" = "sync_service" ] || pkg_args+=(-p "$package")
done

if [ "${#pkg_args[@]}" -eq 0 ]; then
  echo "No packages in the test suite were affected"
  exit 0
fi

deny_warnings cargo nextest run "${common[@]}" "${pkg_args[@]}"
