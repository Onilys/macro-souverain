set -euo pipefail
umask 077

dir=cloudkit-tcp-helper-diagnostics
input_dir=cloudkit-tcp-helper-input
dmg="$input_dir/Macro-2026.1013.1-aarch64-darwin.dmg"
app="$input_dir/Macro.app"
helper="$RUNNER_TEMP/macro-cloudkit-tcp.sh"
mkdir -p "$dir" "$input_dir"
printf 'attempt\ttarget\tstart_utc\thelper_exit\tduration_ms\tblocked_packets\n' \
  > "$dir/results.tsv"

warn() {
  echo "::warning::$*"
}

millis() {
  /usr/bin/perl -MTime::HiRes=time -e 'printf "%.0f\n", time * 1000'
}

raw_log=''
helper_log=''
logger_pid=''
stop_logging() {
  if [ -n "$logger_pid" ]; then
    kill "$logger_pid" 2>/dev/null || true
    wait "$logger_pid" 2>/dev/null || true
    logger_pid=''
  fi
  if [ -n "$raw_log" ]; then
    grep -E '\[com\.apple\.CFNetwork:Summary\].*summary for task' \
      "$raw_log" > "$dir/cfnetwork-summary.txt" || true
    rm -f "$raw_log" || warn 'Could not remove the temporary CFNetwork log'
    raw_log=''
  fi
}
cleanup() {
  stop_logging
  if [ -n "$helper_log" ]; then
    rm -f "$helper_log" || warn 'Could not remove the temporary stapler output'
  fi
}
trap cleanup EXIT

date -u '+start_utc=%Y-%m-%dT%H:%M:%SZ'
sw_vers
xcodebuild -version
if ! command -v gh > /dev/null 2>&1; then
  brew install gh
fi
gh release download v2026.10.13.1 \
  --repo "$GH_REPO" \
  --pattern 'Macro-2026.1013.1-aarch64-darwin.dmg' \
  --dir "$input_dir"
gh release download v2026.10.13.1 \
  --repo "$GH_REPO" \
  --pattern 'Macro-2026.1013.1-aarch64-darwin.app.tar.gz' \
  --dir "$input_dir"
tar -xzf "$input_dir/Macro-2026.1013.1-aarch64-darwin.app.tar.gz" \
  -C "$input_dir"
chmod u+w "$dmg"
chmod -R u+w "$app"
shasum -a 256 "$dmg" > "$dir/input-dmg-sha256.txt"
codesign --verify --strict --verbose=2 "$dmg" \
  > "$dir/input-dmg-codesign.txt" 2>&1
codesign --verify --deep --strict --verbose=2 "$app" \
  > "$dir/input-app-codesign.txt" 2>&1

raw_log=$(mktemp "${RUNNER_TEMP:-/tmp}/macro-cloudkit-helper-cfnetwork.XXXXXX")
/usr/bin/log stream --info --debug --style compact \
  --predicate 'process == "stapler"' \
  > "$raw_log" 2> "$dir/cfnetwork-stderr.txt" &
logger_pid=$!
sleep 1
if ! kill -0 "$logger_pid" 2>/dev/null; then
  warn 'CFNetwork log stream stopped before the first request'
fi

dmg_failures=0
app_failures=0
total_blocked_packets=0
for attempt in {1..10}; do
  for target in dmg app; do
    if [ "$target" = dmg ]; then
      path=$dmg
    else
      path=$app
    fi
    helper_log=$(mktemp "${RUNNER_TEMP:-/tmp}/macro-cloudkit-helper-output.XXXXXX")
    started_utc=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    start_ms=$(millis)
    helper_exit=0
    CFNETWORK_DIAGNOSTICS=1 bash "$helper" "$path" \
      > "$helper_log" 2>&1 || helper_exit=$?
    end_ms=$(millis)
    duration_ms=$((end_ms - start_ms))
    blocked_packets=$(sed -n 's/^CloudKit ticket UDP\/443 blocked packets=\([0-9][0-9]*\)$/\1/p' \
      "$helper_log" | tail -n 1)
    if [ -n "$blocked_packets" ]; then
      total_blocked_packets=$((total_blocked_packets + blocked_packets))
    fi
    # stapler -v includes Apple's signed ticket. Upload only status lines.
    grep -E '^(CloudKit ticket UDP/443|::warning::|The staple|The validate|error is|Failed|Could not|The macOS|PF did not|Unexpected PF)' \
      "$helper_log" | sed "s/^/attempt=$attempt target=$target /" \
      >> "$dir/helper-status.txt" || true
    rm -f "$helper_log"
    helper_log=''
    printf '%d\t%s\t%s\t%d\t%d\t%s\n' \
      "$attempt" "$target" "$started_utc" "$helper_exit" "$duration_ms" \
      "${blocked_packets:-missing}" >> "$dir/results.tsv"
    echo "attempt=$attempt target=$target helper_exit=$helper_exit duration_ms=$duration_ms blocked_packets=${blocked_packets:-missing}"
    if [ "$helper_exit" -ne 0 ]; then
      if [ "$target" = dmg ]; then
        dmg_failures=$((dmg_failures + 1))
      else
        app_failures=$((app_failures + 1))
      fi
    fi
  done
done

sleep 1
stop_logging
summaries=$(grep -c 'summary for task' "$dir/cfnetwork-summary.txt" || true)
h2=$(grep -c 'protocol="h2"' "$dir/cfnetwork-summary.txt" || true)
h3=$(grep -c 'protocol="h3"' "$dir/cfnetwork-summary.txt" || true)
cf_failures=$(grep -c 'summary for task failure' "$dir/cfnetwork-summary.txt" || true)
echo "dmg_helper_failures=$dmg_failures/10 app_helper_failures=$app_failures/10 total_blocked_packets=$total_blocked_packets cfnetwork_summaries=$summaries protocol_h2=$h2 protocol_h3=$h3 cfnetwork_failures=$cf_failures" \
  | tee "$dir/summary.txt"
if [ "$summaries" -ne 40 ] || [ "$h2" -ne 40 ] || [ "$h3" -ne 0 ]; then
  warn "Expected 40 h2 summaries and no h3 from 20 staple/validate helper calls; observed $summaries summaries, $h2 h2, $h3 h3"
fi
date -u '+end_utc=%Y-%m-%dT%H:%M:%SZ'
if [ "$dmg_failures" -ne 0 ] || [ "$app_failures" -ne 0 ] || \
  [ "$total_blocked_packets" -eq 0 ]; then
  warn 'Production helper did not pass every invocation with observed UDP blocking; inspect diagnostic artifact'
  exit 1
fi
