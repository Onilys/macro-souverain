set -euo pipefail
umask 077

dir=cloudkit-transport-diagnostics
dmg=cloudkit-staple-input/Macro-2026.1013.1-aarch64-darwin.dmg
app=cloudkit-staple-input/Macro.app
anchor="com.apple/macro_cloudkit_${GITHUB_RUN_ID:-0}_$$"
mkdir -p "$dir"
printf 'phase\tmode\tattempt\ttarget\tstart_utc\tstaple_exit\tgate_exit\tduration_ms\n' \
  > "$dir/results.tsv"

warn() {
  echo "::warning::$*"
}

millis() {
  /usr/bin/perl -MTime::HiRes=time -e 'printf "%.0f\n", time * 1000'
}

pf_rules=$(mktemp /tmp/macro-cloudkit-pf.XXXXXX)
pf_token=''
pf_loaded=0
raw_log=''
logger_pid=''

# Apple's notarization guide publishes these exact ticket-delivery ranges:
# https://developer.apple.com/documentation/security/customizing-the-notarization-workflow
# Limit the experiment to ticket-delivery UDP/443. Leave TCP/443 alone.
cat > "$pf_rules" <<'RULES'
block return out quick inet proto udp from any to 17.36.196.0/22 port 443
block return out quick inet proto udp from any to 17.57.0.0/22 port 443
block return out quick inet proto udp from any to 17.248.128.0/17 port 443
block return out quick inet proto udp from any to 17.250.48.0/20 port 443
block return out quick inet proto udp from any to 17.250.64.0/18 port 443
block return out quick inet proto udp from any to 17.252.62.0/23 port 443
block return out quick inet6 proto udp from any to 2403:300:a41::/48 port 443
block return out quick inet6 proto udp from any to 2403:300:a50:100::/56 port 443
block return out quick inet6 proto udp from any to 2403:300:1360::/44 port 443
block return out quick inet6 proto udp from any to 2403:300:1502::/48 port 443
block return out quick inet6 proto udp from any to 2620:149:a40::/46 port 443
block return out quick inet6 proto udp from any to 2620:149:1360::/44 port 443
block return out quick inet6 proto udp from any to 2a01:b740:984::/56 port 443
block return out quick inet6 proto udp from any to 2a01:b740:984:100::/64 port 443
block return out quick inet6 proto udp from any to 2a01:b740:a41::/48 port 443
block return out quick inet6 proto udp from any to 2a01:b740:1360::/44 port 443
RULES

stop_pf() {
  local cleared=0 rules attempt
  if [ "$pf_loaded" -eq 1 ]; then
    for attempt in 1 2 3; do
      if sudo -n pfctl -a "$anchor" -F rules > /dev/null 2>&1 && \
        rules=$(sudo -n pfctl -a "$anchor" -sr 2> /dev/null) && \
        [ -z "$rules" ]; then
        cleared=1
        break
      fi
      sleep 1
    done
    if [ "$cleared" -ne 1 ]; then
      warn "Could not clear and verify the diagnostic PF anchor $anchor after three attempts; stopping the runner"
      return 1
    fi
    pf_loaded=0
  fi
  if [ -n "$pf_token" ]; then
    if ! sudo -n pfctl -X "$pf_token" > /dev/null 2>&1; then
      warn "Could not release the diagnostic PF enable token"
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
  trap - EXIT
  stop_logging
  if ! stop_pf; then
    warn 'Diagnostic PF cleanup failed; the disposable runner must stop'
    exit 1
  fi
  rm -f "$pf_rules" || warn 'Could not remove the temporary PF rule file'
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

pf_rule_format() {
  awk '
    {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      sub(/[[:space:]]+$/, "", line)
      if (line == "") next
      count++
      if (line ~ /^block return out quick inet proto udp from any to [0-9.]+\/[0-9]+ port = 443$/) literal4++
      else if (line ~ /^block return out quick inet6 proto udp from any to [0-9a-fA-F:]+\/[0-9]+ port = 443$/) literal6++
      else if (line ~ /^block return out quick inet proto udp from any to <__automatic_[^>]+> port = 443$/) automatic4++
      else if (line ~ /^block return out quick inet6 proto udp from any to <__automatic_[^>]+> port = 443$/) automatic6++
      else bad++
    }
    END {
      if (count == 16 && literal4 == 6 && literal6 == 10 && bad == 0) print "literal"
      else if (count == 2 && automatic4 == 1 && automatic6 == 1 && bad == 0) print "automatic"
      else exit 1
    }
  ' "$1"
}

start_pf() {
  local phase="$1" enable_output refs_before refs_after recovered_token
  if ! sudo -n pfctl -s info > /dev/null 2> "$dir/$phase-pf-setup.txt"; then
    warn "$phase: sudo -n pfctl is unavailable; skipping the blocked arm"
    return 1
  fi
  if ! sudo -n pfctl -n -a "$anchor" -f "$pf_rules" \
    >> "$dir/$phase-pf-setup.txt" 2>&1; then
    warn "$phase: PF rejected the Apple UDP/443 rules; skipping the blocked arm"
    return 1
  fi

  # Capture references so a successful -E with an unexpected output format can
  # still be undone without disabling PF for another system component.
  refs_before=$(mktemp /tmp/macro-cloudkit-pf-refs.XXXXXX)
  if ! sudo -n pfctl -s References > "$refs_before" 2>> "$dir/$phase-pf-setup.txt"; then
    rm "$refs_before"
    warn "$phase: could not inspect PF references before enabling; skipping the blocked arm"
    return 1
  fi

  if ! enable_output=$(sudo -n pfctl -E 2>&1); then
    rm "$refs_before"
    warn "$phase: PF could not be enabled; skipping the blocked arm"
    return 1
  fi
  pf_token=$(printf '%s\n' "$enable_output" \
    | awk 'tolower($0) ~ /token[[:space:]]*:/ { print $NF; exit }')
  if [[ ! "$pf_token" =~ ^(0x[[:xdigit:]]+|[[:digit:]]+)$ ]]; then
    pf_token=''
    printf '%s\n' "$enable_output" > "$dir/$phase-pf-enable-raw.txt"
    refs_after=$(mktemp /tmp/macro-cloudkit-pf-refs.XXXXXX)
    recovered_token=''
    if sudo -n pfctl -s References > "$refs_after" 2> /dev/null; then
      recovered_token=$(comm -13 <(sort "$refs_before") <(sort "$refs_after") \
        | awk '$1 ~ /^[0-9]+$/ && $3 ~ /^(0x[0-9a-fA-F]+|[0-9]+)$/ { print $3 }' \
        | sort -u || true)
    fi
    rm "$refs_before" "$refs_after"
    if [[ "$recovered_token" =~ ^(0x[[:xdigit:]]+|[[:digit:]]+)$ ]]; then
      if ! sudo -n pfctl -X "$recovered_token" > /dev/null 2>&1; then
        warn "$phase: could not release the recovered PF enable token; stopping the runner"
        exit 1
      fi
    else
      warn "$phase: PF enable token could not be recovered; no filter rules were loaded, but the enable reference may remain; stopping the runner"
      exit 1
    fi
    warn "$phase: PF enable output was unexpected; released the recovered token and stopped the runner"
    exit 1
  fi
  rm "$refs_before"
  echo 'PF enable token acquired' >> "$dir/$phase-pf-setup.txt"

  # A failed load may still leave some rules in the anchor. Mark it loaded
  # before attempting the load so cleanup always flushes and verifies it.
  pf_loaded=1
  if ! sudo -n pfctl -a "$anchor" -f "$pf_rules" \
    >> "$dir/$phase-pf-setup.txt" 2>&1; then
    warn "$phase: failed to load the diagnostic PF anchor"
    if ! stop_pf; then
      exit 1
    fi
    return 1
  fi
  # Capture the kernel's normalized view before checking it. PF may print a
  # network differently from the source CIDR (for example, omit ".0").
  local child_status=0 main_status=0 anchors_status=0 status_status=0
  sudo -n pfctl -a "$anchor" -sr \
    > "$dir/$phase-pf-child-rules.txt" 2> "$dir/$phase-pf-child-rules-stderr.txt" || child_status=$?
  sudo -n pfctl -sr \
    > "$dir/$phase-pf-main-rules.txt" 2> "$dir/$phase-pf-main-rules-stderr.txt" || main_status=$?
  sudo -n pfctl -s Anchors \
    > "$dir/$phase-pf-main-anchors.txt" 2> "$dir/$phase-pf-main-anchors-stderr.txt" || anchors_status=$?
  sudo -n pfctl -s info \
    > "$dir/$phase-pf-status.txt" 2> "$dir/$phase-pf-status-stderr.txt" || status_status=$?
  sudo -n pfctl -a "$anchor" -s Tables \
    > "$dir/$phase-pf-tables.txt" 2> "$dir/$phase-pf-tables-stderr.txt" || \
    warn "$phase: could not list the diagnostic PF tables"
  if [ "$child_status" -ne 0 ] || [ "$main_status" -ne 0 ] || \
    [ "$anchors_status" -ne 0 ] || [ "$status_status" -ne 0 ]; then
    warn "$phase: could not capture PF rules, anchors, or status"
    if ! stop_pf; then
      exit 1
    fi
    return 1
  fi
  local rule_count rule_format
  rule_count=$(awk 'NF { count++ } END { print count + 0 }' \
    "$dir/$phase-pf-child-rules.txt")
  rule_format=$(pf_rule_format "$dir/$phase-pf-child-rules.txt") || rule_format=invalid
  echo "phase=$phase pf_child_rule_count=$rule_count rule_format=$rule_format expected=16-literal-or-2-automatic" \
    >> "$dir/$phase-pf-setup.txt"
  if [ "$rule_format" = invalid ] || \
    ! grep -Eq '^[[:space:]]*anchor[[:space:]]+"?com[.]apple/[*]"?([[:space:]]|$)' \
      "$dir/$phase-pf-main-rules.txt" || \
    ! grep -Eq '^[[:space:]]*"?com[.]apple"?[[:space:]]*$' \
      "$dir/$phase-pf-main-anchors.txt" || \
    ! grep -Eq '^Status:[[:space:]]+Enabled([[:space:]]|$)' \
      "$dir/$phase-pf-status.txt"; then
    warn "$phase: PF did not confirm 16 literal rules or 2 automatic table rules, the active com.apple/* main hook, and enabled status; inspect PF artifacts"
    if ! stop_pf; then
      exit 1
    fi
    return 1
  fi
  echo "phase=$phase pf_anchor=$anchor pf_status=enabled child_rules=$rule_count rule_format=$rule_format main_hook=present"
}

start_logging() {
  current_phase="$1"
  raw_log=$(mktemp /tmp/macro-cloudkit-cfnetwork.XXXXXX)
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
last_gate_exit=0
direct_valid_phases=0
blocked_valid_phases=0
direct_h3_total=0
direct_staple_failures=0
blocked_staple_failures=0
a1_staple_failures=0
a2_staple_failures=0
b1_staple_failures=0
b2_staple_failures=0
run_target() {
  local phase="$1" mode="$2" attempt="$3" target="$4" path="$5"
  local started_utc start_ms end_ms elapsed_ms stapler_log gate_log
  started_utc=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  start_ms=$(millis)
  stapler_log=$(mktemp /tmp/macro-cloudkit-stapler.XXXXXX)
  last_staple_exit=0
  CFNETWORK_DIAGNOSTICS=1 xcrun stapler staple -v "$path" \
    > "$stapler_log" 2>&1 || last_staple_exit=$?
  end_ms=$(millis)
  elapsed_ms=$((end_ms - start_ms))

  # The verbose output includes Apple's signed ticket. Keep only status lines.
  grep -E '^Domain is|^Response is|^error is|^The staple' "$stapler_log" \
    | sed "s/^/phase=$phase attempt=$attempt target=$target /" \
    >> "$dir/stapler-status.txt" || true
  rm "$stapler_log"

  last_gate_exit=-1
  if [ "$last_staple_exit" -eq 0 ]; then
    gate_log=$(mktemp /tmp/macro-cloudkit-gate.XXXXXX)
    last_gate_exit=0
    if [ "$target" = dmg ]; then
      {
        codesign --verify --strict --verbose=2 "$path" &&
        spctl --assess --type open --context context:primary-signature \
          --verbose=2 "$path"
      } > "$gate_log" 2>&1 || last_gate_exit=$?
    else
      {
        codesign --verify --deep --strict --verbose=2 "$path" &&
        spctl --assess --type execute --verbose=2 "$path"
      } > "$gate_log" 2>&1 || last_gate_exit=$?
    fi
    grep -E 'valid on disk|satisfies its Designated Requirement|accepted|source=|error:' \
      "$gate_log" | sed "s/^/phase=$phase attempt=$attempt target=$target /" \
      >> "$dir/gate-status.txt" || true
    rm "$gate_log"
  fi

  printf '%s\t%s\t%d\t%s\t%s\t%d\t%d\t%d\n' \
    "$phase" "$mode" "$attempt" "$target" "$started_utc" \
    "$last_staple_exit" "$last_gate_exit" "$elapsed_ms" >> "$dir/results.tsv"
  echo "phase=$phase mode=$mode attempt=$attempt target=$target staple_exit=$last_staple_exit gate_exit=$last_gate_exit duration_ms=$elapsed_ms"
  [ "$last_staple_exit" -eq 0 ] && [ "$last_gate_exit" -eq 0 ]
}

run_phase() {
  local phase="$1" mode="$2" attempt pair_ok
  local dmg_failures=0 app_failures=0 dmg_gate_failures=0 app_gate_failures=0
  local pair_successes=0 summaries h2 h3 other failures pf_packets=0 valid=no

  if [ "$mode" = blocked ] && ! start_pf "$phase"; then
    echo "phase=$phase mode=$mode status=skipped reason=pf_unavailable" \
      | tee -a "$dir/phase-summary.txt"
    return 0
  fi

  start_logging "$phase"
  for attempt in {1..10}; do
    pair_ok=1
    if ! run_target "$phase" "$mode" "$attempt" dmg "$dmg"; then
      pair_ok=0
      if [ "$last_staple_exit" -ne 0 ]; then
        dmg_failures=$((dmg_failures + 1))
      else
        dmg_gate_failures=$((dmg_gate_failures + 1))
      fi
    fi
    if ! run_target "$phase" "$mode" "$attempt" app "$app"; then
      pair_ok=0
      if [ "$last_staple_exit" -ne 0 ]; then
        app_failures=$((app_failures + 1))
      else
        app_gate_failures=$((app_gate_failures + 1))
      fi
    fi
    if [ "$pair_ok" -eq 1 ]; then
      pair_successes=$((pair_successes + 1))
    fi
  done

  # Let the unified log stream flush the last request before counting protocols.
  sleep 1
  stop_logging
  summaries=$(grep -c 'summary for task' "$dir/$phase-cfnetwork-summary.txt" || true)
  h2=$(grep -c 'protocol="h2"' "$dir/$phase-cfnetwork-summary.txt" || true)
  h3=$(grep -c 'protocol="h3"' "$dir/$phase-cfnetwork-summary.txt" || true)
  other=$((summaries - h2 - h3))
  failures=$(grep -c 'summary for task failure' "$dir/$phase-cfnetwork-summary.txt" || true)

  if [ "$mode" = blocked ]; then
    blocked_staple_failures=$((blocked_staple_failures + dmg_failures + app_failures))
    if [ "$phase" = B1 ]; then
      b1_staple_failures=$((dmg_failures + app_failures))
    else
      b2_staple_failures=$((dmg_failures + app_failures))
    fi
    if sudo -n pfctl -a "$anchor" -vvsr \
      > "$dir/$phase-pf-counters.txt" 2>&1; then
      pf_packets=$(awk '/Packets:/ { for (i = 1; i <= NF; i++) if ($i == "Packets:") total += $(i + 1) } END { print total + 0 }' \
        "$dir/$phase-pf-counters.txt")
    else
      warn "$phase: could not read diagnostic PF counters"
    fi
    if [ "$summaries" -eq 20 ] && [ "$h2" -eq 20 ] && \
      [ "$h3" -eq 0 ] && [ "$pf_packets" -gt 0 ]; then
      valid=yes
      blocked_valid_phases=$((blocked_valid_phases + 1))
    else
      valid=no
      warn "$phase: blocked arm was not fully confirmed ($h2 h2, $h3 h3, $summaries summaries, $pf_packets blocked packets)"
    fi
    stop_pf
  else
    direct_h3_total=$((direct_h3_total + h3))
    direct_staple_failures=$((direct_staple_failures + dmg_failures + app_failures))
    if [ "$phase" = A1 ]; then
      a1_staple_failures=$((dmg_failures + app_failures))
    else
      a2_staple_failures=$((dmg_failures + app_failures))
    fi
    if [ "$summaries" -eq 20 ] && [ "$h3" -gt 0 ] && \
      [ "$other" -eq 0 ]; then
      valid=yes
      direct_valid_phases=$((direct_valid_phases + 1))
    else
      warn "$phase: direct arm did not demonstrate h3 for a complete set of 20 requests ($h2 h2, $h3 h3, $summaries summaries)"
    fi
  fi

  echo "phase=$phase mode=$mode dmg_staple_failures=$dmg_failures app_staple_failures=$app_failures dmg_gate_failures=$dmg_gate_failures app_gate_failures=$app_gate_failures pair_successes=$pair_successes/10 cfnetwork_failures=$failures cfnetwork_summaries=$summaries protocol_h2=$h2 protocol_h3=$h3 protocol_other=$other pf_blocked_packets=$pf_packets arm_valid=$valid" \
    | tee -a "$dir/phase-summary.txt"
  if [ "$pair_successes" -ne 10 ]; then
    warn "$phase: only $pair_successes of 10 DMG/app pairs passed"
  fi
}

date -u '+start_utc=%Y-%m-%dT%H:%M:%SZ'
sw_vers
xcodebuild -version
echo 'CloudKit DNS addresses:'
dscacheutil -q host -a name api.apple-cloudkit.com \
  | awk '/^(name|ip_address):/ { print }' || true

phase_order=${PHASE_ORDER:-ABAB}
echo "phase_order=$phase_order"
case "$phase_order" in
  ABAB)
    run_phase A1 direct
    run_phase B1 blocked
    run_phase A2 direct
    run_phase B2 blocked
    ;;
  BABA)
    run_phase B1 blocked
    run_phase A1 direct
    run_phase B2 blocked
    run_phase A2 direct
    ;;
  *)
    warn "Unsupported PHASE_ORDER=$phase_order (expected ABAB or BABA)"
    exit 1
    ;;
esac

experiment_conclusive=no
if [ "$direct_valid_phases" -eq 2 ] && [ "$blocked_valid_phases" -eq 2 ] && \
  [ "$a1_staple_failures" -gt 0 ] && [ "$a2_staple_failures" -gt 0 ]; then
  experiment_conclusive=yes
else
  warn "Transport comparison is inconclusive: valid direct phases=$direct_valid_phases/2, valid blocked phases=$blocked_valid_phases/2, direct h3 requests=$direct_h3_total, A1 failures=$a1_staple_failures, A2 failures=$a2_staple_failures"
fi
echo "experiment_conclusive=$experiment_conclusive phase_order=$phase_order valid_direct_phases=$direct_valid_phases/2 valid_blocked_phases=$blocked_valid_phases/2 direct_h3_requests=$direct_h3_total A1_staple_failures=$a1_staple_failures A2_staple_failures=$a2_staple_failures B1_staple_failures=$b1_staple_failures B2_staple_failures=$b2_staple_failures" \
  | tee -a "$dir/phase-summary.txt"
date -u '+end_utc=%Y-%m-%dT%H:%M:%SZ'
# This is an experiment. Transport failures should appear in the phase summary
# without triggering the production build-failure alert.
