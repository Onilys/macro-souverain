set -euo pipefail

dir=cloudkit-staple-diagnostics
dmg=cloudkit-staple-input/Macro-2026.1013.1-aarch64-darwin.dmg
app=cloudkit-staple-input/Macro.app
mkdir -p "$dir"

date -u '+start_utc=%Y-%m-%dT%H:%M:%SZ'
sw_vers
xcodebuild -version
echo 'CloudKit DNS addresses:'
dscacheutil -q host -a name api.apple-cloudkit.com \
  | awk '/^(name|ip_address):/ { print }' || true

raw_log=$(mktemp /tmp/cloudkit-staple-cfnetwork.XXXXXX)
logger_pid=''
finish_logging() {
  if [ -n "$logger_pid" ]; then
    kill "$logger_pid" 2>/dev/null || true
    wait "$logger_pid" 2>/dev/null || true
    logger_pid=''
  fi
  grep -E '\[com\.apple\.CFNetwork:Summary\].*summary for task|\[com\.apple\.network:connection\].*error Operation timed out|\[com\.apple\.CFNetwork:Default\].*HTTP load failed' \
    "$raw_log" > "$dir/cfnetwork-summary.txt" || true
  rm "$raw_log" || true
}
trap finish_logging EXIT

/usr/bin/log stream --info --debug --style compact \
  --predicate 'process == "stapler"' \
  > "$raw_log" 2> "$dir/cfnetwork-stderr.txt" &
logger_pid=$!
sleep 1

dmg_staple_failures=0
app_staple_failures=0
dmg_gate_failures=0
app_gate_failures=0
pair_successes=0

for attempt in {1..20}; do
  pair_ok=1

  status=0
  start=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  CFNETWORK_DIAGNOSTICS=1 xcrun stapler staple -v "$dmg" \
    > "$dir/dmg-staple-$attempt.log" 2>&1 || status=$?
  echo "attempt=$attempt target=dmg operation=staple start_utc=$start exit=$status"
  grep -E 'error is|The staple and validate action|The staple action' \
    "$dir/dmg-staple-$attempt.log" | tail -n 4 || true
  if [ "$status" -ne 0 ]; then
    dmg_staple_failures=$((dmg_staple_failures + 1))
    pair_ok=0
  else
    gate_status=0
    {
      codesign --verify --strict --verbose=2 "$dmg"
      spctl --assess --type open --context context:primary-signature \
        --verbose=2 "$dmg"
    } > "$dir/dmg-gate-$attempt.log" 2>&1 || gate_status=$?
    echo "attempt=$attempt target=dmg operation=code-sign-and-gatekeeper exit=$gate_status"
    if [ "$gate_status" -ne 0 ]; then
      dmg_gate_failures=$((dmg_gate_failures + 1))
      pair_ok=0
    fi
  fi

  status=0
  start=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  CFNETWORK_DIAGNOSTICS=1 xcrun stapler staple -v "$app" \
    > "$dir/app-staple-$attempt.log" 2>&1 || status=$?
  echo "attempt=$attempt target=app operation=staple start_utc=$start exit=$status"
  grep -E 'error is|The staple and validate action|The staple action' \
    "$dir/app-staple-$attempt.log" | tail -n 4 || true
  if [ "$status" -ne 0 ]; then
    app_staple_failures=$((app_staple_failures + 1))
    pair_ok=0
  else
    gate_status=0
    {
      codesign --verify --deep --strict --verbose=2 "$app"
      spctl --assess --type execute --verbose=2 "$app"
    } > "$dir/app-gate-$attempt.log" 2>&1 || gate_status=$?
    echo "attempt=$attempt target=app operation=code-sign-and-gatekeeper exit=$gate_status"
    if [ "$gate_status" -ne 0 ]; then
      app_gate_failures=$((app_gate_failures + 1))
      pair_ok=0
    fi
  fi

  if [ "$pair_ok" -eq 1 ]; then
    pair_successes=$((pair_successes + 1))
  fi
done

finish_logging
trap - EXIT
echo 'CFNetwork request failures:'
grep 'summary for task failure' "$dir/cfnetwork-summary.txt" | tail -n 30 || true
echo "dmg_staple_failures=$dmg_staple_failures app_staple_failures=$app_staple_failures dmg_gate_failures=$dmg_gate_failures app_gate_failures=$app_gate_failures pair_successes=$pair_successes/20"
date -u '+end_utc=%Y-%m-%dT%H:%M:%SZ'

# A diagnostic sample failure is a result, not a failed release. Keep this
# workflow green so the production build-failure alert is not triggered.
if [ "$pair_successes" -ne 20 ]; then
  echo "::warning::Only $pair_successes of 20 no-validation release checks passed"
fi
