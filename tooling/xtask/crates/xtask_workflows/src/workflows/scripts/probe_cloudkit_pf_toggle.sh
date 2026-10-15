set -euo pipefail
umask 077

dir=cloudkit-pf-toggle-diagnostics
dmg=cloudkit-staple-input/Macro-2026.1013.1-aarch64-darwin.dmg
app=cloudkit-staple-input/Macro.app
toggle_position=${TOGGLE_POSITION:-}
case "$toggle_position" in
  before-first|between-samples) ;;
  *) echo "::error::TOGGLE_POSITION must be before-first or between-samples"; exit 1 ;;
esac
mkdir -p "$dir"
printf 'phase\tattempt\ttarget\tstart_utc\tstaple_exit\tduration_ms\n' \
  > "$dir/results.tsv"

warn() {
  echo "::warning::$*"
}

millis() {
  /usr/bin/perl -MTime::HiRes=time -e 'printf "%.0f\n", time * 1000'
}

pf_token=''
raw_log=''
logger_pid=''
current_phase=''
toggle_performed=no
transition_verified=no
sample1_failures=0
sample2_failures=0
valid_phases=0

release_pf_token() {
  if [ -n "$pf_token" ]; then
    if ! sudo -n pfctl -X "$pf_token" > /dev/null 2>&1; then
      warn 'Could not release the diagnostic PF enable token; stopping the runner'
      return 1
    fi
    pf_token=''
  fi
}

stop_logging() {
  if [ -n "$logger_pid" ]; then
    kill "$logger_pid" 2>/dev/null || true
    wait "$logger_pid" 2>/dev/null || true
    logger_pid=''
  fi
  if [ -n "$raw_log" ]; then
    grep -E '\[com\.apple\.CFNetwork:Summary\].*summary for task' \
      "$raw_log" > "$dir/$current_phase-cfnetwork-summary.txt" || true
    rm -f "$raw_log" || warn 'Could not remove the temporary CFNetwork log'
    raw_log=''
  fi
}

cleanup() {
  local original_exit=$?
  trap - EXIT
  stop_logging
  if ! release_pf_token; then
    exit 1
  fi
  exit "$original_exit"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

pf_status() {
  awk '/^Status:/ { print $2; exit }' "$1"
}

toggle_pf() {
  local before_refs after_refs enable_output recovered_token
  local before_status during_status after_status

  if ! sudo -n pfctl -s info > "$dir/pf-before.txt" 2> "$dir/pf-before-stderr.txt"; then
    warn 'sudo -n pfctl is unavailable; PF cycle was not run'
    return 1
  fi
  before_status=$(pf_status "$dir/pf-before.txt")
  before_refs=$(mktemp /tmp/macro-pf-toggle-refs.XXXXXX)
  if ! sudo -n pfctl -s References > "$before_refs" 2> "$dir/pf-references-stderr.txt"; then
    rm -f "$before_refs"
    warn 'Could not inspect PF references before enabling; PF cycle was not run'
    return 1
  fi

  if ! enable_output=$(sudo -n pfctl -E 2>&1); then
    rm -f "$before_refs"
    warn 'PF could not be enabled; PF cycle was not run'
    return 1
  fi
  pf_token=$(printf '%s\n' "$enable_output" \
    | awk 'tolower($0) ~ /token[[:space:]]*:/ { print $NF; exit }')
  if [[ ! "$pf_token" =~ ^(0x[[:xdigit:]]+|[[:digit:]]+)$ ]]; then
    pf_token=''
    printf '%s\n' "$enable_output" > "$dir/pf-enable-raw.txt"
    after_refs=$(mktemp /tmp/macro-pf-toggle-refs.XXXXXX)
    recovered_token=''
    if sudo -n pfctl -s References > "$after_refs" 2> /dev/null; then
      recovered_token=$(comm -13 <(sort "$before_refs") <(sort "$after_refs") \
        | awk '$1 ~ /^[0-9]+$/ && $3 ~ /^(0x[0-9a-fA-F]+|[0-9]+)$/ { print $3 }' \
        | sort -u || true)
    fi
    rm -f "$before_refs" "$after_refs"
    if [[ "$recovered_token" =~ ^(0x[[:xdigit:]]+|[[:digit:]]+)$ ]]; then
      pf_token=$recovered_token
      if ! release_pf_token; then
        exit 1
      fi
    else
      warn 'PF enable token could not be recovered; the enable reference may remain; stopping the runner'
      exit 1
    fi
    warn 'PF enable output was unexpected; released the recovered token and stopped the runner'
    exit 1
  fi
  rm -f "$before_refs"

  if ! sudo -n pfctl -s info > "$dir/pf-during.txt" 2> "$dir/pf-during-stderr.txt"; then
    warn 'Could not inspect PF status while enabled'
  fi
  during_status=$(pf_status "$dir/pf-during.txt")
  if ! release_pf_token; then
    exit 1
  fi
  toggle_performed=yes
  if ! sudo -n pfctl -s info > "$dir/pf-after.txt" 2> "$dir/pf-after-stderr.txt"; then
    warn 'Could not inspect PF status after releasing the token'
  fi
  after_status=$(pf_status "$dir/pf-after.txt")
  if [ "$before_status" = Disabled ] && [ "$during_status" = Enabled ] && \
    [ "$after_status" = Disabled ]; then
    transition_verified=yes
  else
    warn "PF cycle did not prove a Disabled→Enabled→Disabled transition ($before_status → $during_status → $after_status)"
  fi
  echo "pf_cycle_completed=$toggle_performed pf_transition_verified=$transition_verified before=$before_status during=$during_status after=$after_status" \
    | tee "$dir/pf-cycle-summary.txt"
}

start_logging() {
  current_phase="$1"
  raw_log=$(mktemp /tmp/macro-pf-toggle-cfnetwork.XXXXXX)
  /usr/bin/log stream --info --debug --style compact \
    --predicate 'process == "stapler"' \
    > "$raw_log" 2> "$dir/$current_phase-cfnetwork-stderr.txt" &
  logger_pid=$!
  sleep 1
  if ! kill -0 "$logger_pid" 2>/dev/null; then
    warn "$current_phase: CFNetwork log stream stopped before the first request"
  fi
}

last_staple_exit=0
run_target() {
  local phase="$1" attempt="$2" target="$3" path="$4"
  local started_utc start_ms end_ms elapsed_ms stapler_log
  started_utc=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  start_ms=$(millis)
  stapler_log=$(mktemp /tmp/macro-pf-toggle-stapler.XXXXXX)
  last_staple_exit=0
  CFNETWORK_DIAGNOSTICS=1 xcrun stapler staple -v "$path" \
    > "$stapler_log" 2>&1 || last_staple_exit=$?
  end_ms=$(millis)
  elapsed_ms=$((end_ms - start_ms))
  # Apple's verbose response includes a signed ticket. Keep status lines only.
  grep -E '^Domain is|^Response is|^error is|^The staple' "$stapler_log" \
    | sed "s/^/phase=$phase attempt=$attempt target=$target /" \
    >> "$dir/stapler-status.txt" || true
  rm -f "$stapler_log"
  printf '%s\t%d\t%s\t%s\t%d\t%d\n' \
    "$phase" "$attempt" "$target" "$started_utc" "$last_staple_exit" "$elapsed_ms" \
    >> "$dir/results.tsv"
  echo "phase=$phase attempt=$attempt target=$target staple_exit=$last_staple_exit duration_ms=$elapsed_ms"
  [ "$last_staple_exit" -eq 0 ]
}

run_phase() {
  local phase="$1" attempt dmg_failures=0 app_failures=0
  local summaries h2 h3 other cf_failures valid=no
  start_logging "$phase"
  for attempt in {1..10}; do
    if ! run_target "$phase" "$attempt" dmg "$dmg"; then
      dmg_failures=$((dmg_failures + 1))
    fi
    if ! run_target "$phase" "$attempt" app "$app"; then
      app_failures=$((app_failures + 1))
    fi
  done
  sleep 1
  stop_logging
  summaries=$(grep -c 'summary for task' "$dir/$phase-cfnetwork-summary.txt" || true)
  h2=$(grep -c 'protocol="h2"' "$dir/$phase-cfnetwork-summary.txt" || true)
  h3=$(grep -c 'protocol="h3"' "$dir/$phase-cfnetwork-summary.txt" || true)
  other=$((summaries - h2 - h3))
  cf_failures=$(grep -c 'summary for task failure' "$dir/$phase-cfnetwork-summary.txt" || true)
  if [ "$summaries" -eq 20 ] && [ "$h3" -gt 0 ] && [ "$other" -eq 0 ]; then
    valid=yes
    valid_phases=$((valid_phases + 1))
  else
    warn "$phase: expected 20 CFNetwork summaries and some h3 traffic ($summaries summaries, $h3 h3)"
  fi
  if [ "$phase" = sample1 ]; then
    sample1_failures=$((dmg_failures + app_failures))
  else
    sample2_failures=$((dmg_failures + app_failures))
  fi
  echo "phase=$phase toggle_position=$toggle_position pf_cycle_completed=$toggle_performed dmg_staple_failures=$dmg_failures app_staple_failures=$app_failures cfnetwork_failures=$cf_failures cfnetwork_summaries=$summaries protocol_h2=$h2 protocol_h3=$h3 protocol_other=$other phase_valid=$valid" \
    | tee -a "$dir/phase-summary.txt"
}

date -u '+start_utc=%Y-%m-%dT%H:%M:%SZ'
sw_vers
xcodebuild -version
echo "toggle_position=$toggle_position"
echo 'CloudKit DNS addresses:'
dscacheutil -q host -a name api.apple-cloudkit.com \
  | awk '/^(name|ip_address):/ { print }' || true

if [ "$toggle_position" = before-first ]; then
  if ! toggle_pf; then
    warn 'The first direct sample will run without a verified PF cycle'
  fi
fi
run_phase sample1
if [ "$toggle_position" = between-samples ]; then
  if ! toggle_pf; then
    warn 'The second direct sample will run without a verified PF cycle'
  fi
fi
run_phase sample2

experiment_valid=no
if [ "$transition_verified" = yes ] && [ "$valid_phases" -eq 2 ]; then
  experiment_valid=yes
else
  warn "PF cycle comparison is inconclusive: transition_verified=$transition_verified, valid phases=$valid_phases/2"
fi
echo "experiment_valid=$experiment_valid toggle_position=$toggle_position pf_cycle_completed=$toggle_performed pf_transition_verified=$transition_verified valid_phases=$valid_phases/2 sample1_staple_failures=$sample1_failures sample2_staple_failures=$sample2_failures" \
  | tee -a "$dir/phase-summary.txt"
date -u '+end_utc=%Y-%m-%dT%H:%M:%SZ'
