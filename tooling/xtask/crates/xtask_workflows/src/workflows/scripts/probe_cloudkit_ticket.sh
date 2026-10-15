set -euo pipefail

dir=cloudkit-diagnostics
dmg=cloudkit-dmg/Macro-2026.1013.1-aarch64-darwin.dmg
endpoint='https://api.apple-cloudkit.com/database/1/com.apple.gk.ticket-delivery/production/public/records/lookup'
record='{"records":[{"recordName":"2/2/8dfeaa39efe33becd4583f7d3747f6dc438763f1"}]}'

mkdir -p "$dir"
date -u '+start_utc=%Y-%m-%dT%H:%M:%SZ'
sw_vers
xcodebuild -version
curl --version | head -n 1
curl_http3=''
for candidate in /opt/homebrew/opt/curl/bin/curl /usr/local/opt/curl/bin/curl "$(command -v curl)"; do
  if [ -x "$candidate" ] && "$candidate" --version | grep -q 'HTTP3'; then
    curl_http3=$candidate
    echo "HTTP/3 client: $curl_http3"
    break
  fi
done
if [ -z "$curl_http3" ]; then
  echo 'HTTP/3 curl unavailable on this runner'
fi
echo 'CloudKit DNS addresses:'
dscacheutil -q host -a name api.apple-cloudkit.com | awk '/^(name|ip_address):/ { print }' || true

rm -f "$dir/tcpdump.pid"
raw_log=$(mktemp "${RUNNER_TEMP:-/tmp}/cloudkit-cfnetwork.XXXXXX")
logger_pid=''
capture_launcher=''
capture_pid=''

stop_capture() {
  if [ -z "$capture_pid" ] && [ -s "$dir/tcpdump.pid" ]; then
    capture_pid=$(sudo -n cat "$dir/tcpdump.pid" 2>/dev/null) || true
  fi
  if [ -n "$capture_pid" ]; then
    sudo -n kill -INT "$capture_pid" 2>/dev/null || true
    capture_pid=''
  elif [ -n "$capture_launcher" ]; then
    sudo -n kill -INT "$capture_launcher" 2>/dev/null || true
  fi
  if [ -n "$capture_launcher" ]; then
    wait "$capture_launcher" 2>/dev/null || true
    capture_launcher=''
  fi
}

stop_logging() {
  if [ -n "$logger_pid" ]; then
    kill "$logger_pid" 2>/dev/null || true
    wait "$logger_pid" 2>/dev/null || true
    logger_pid=''
  fi
  grep -E '\[com\.apple\.CFNetwork:Summary\].*summary for task|\[com\.apple\.network:connection\].*error Operation timed out|\[com\.apple\.CFNetwork:Default\].*HTTP load failed' \
    "$raw_log" > "$dir/cfnetwork-summary.txt" || true
  rm -f "$raw_log"
}

finish_diagnostics() {
  stop_capture
  stop_logging
}
trap finish_diagnostics EXIT

/usr/bin/log stream --info --debug --style compact \
  --predicate 'process == "stapler"' \
  > "$raw_log" 2> "$dir/cfnetwork-stderr.txt" &
logger_pid=$!

interface=$(route -n get default 2>/dev/null | awk '$1 == "interface:" { print $2; exit }') || true
if [ -n "$interface" ] && sudo -n tcpdump -D >/dev/null 2>&1; then
  echo "Capturing Apple TCP/443 and UDP/443 headers on $interface"
  sudo -n sh -c 'echo $$ > "$1"; shift; exec tcpdump "$@"' sh \
    "$dir/tcpdump.pid" -i "$interface" -n -U -s 96 \
    -w "$dir/cloudkit.pcap" 'port 443 and net 17.0.0.0/8' \
    > "$dir/tcpdump.stdout" 2> "$dir/tcpdump.stderr" &
  capture_launcher=$!
  sleep 1
  if [ -s "$dir/tcpdump.pid" ]; then
    capture_pid=$(sudo -n cat "$dir/tcpdump.pid" 2>/dev/null) || true
  fi
  if [ -z "$capture_pid" ] || ! kill -0 "$capture_launcher" 2>/dev/null; then
    echo 'tcpdump exited before the first lookup'
    sudo -n kill -INT "$capture_launcher" 2>/dev/null || true
    wait "$capture_launcher" 2>/dev/null || true
    capture_launcher=''
    capture_pid=''
    rm -f "$dir/tcpdump.pid"
  fi
else
  echo 'Packet capture unavailable; continuing with request results'
fi

validate_failures=0
curl_failures=0
http3_failures=0
for attempt in {1..20}; do
  validate_log="$dir/validate-$attempt.log"
  validate_exit=0
  start=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  CFNETWORK_DIAGNOSTICS=1 xcrun stapler validate -v "$dmg" > "$validate_log" 2>&1 || validate_exit=$?
  echo "attempt=$attempt kind=stapler start_utc=$start exit=$validate_exit"
  grep -E 'Domain is|Response is|error is|The validate action' "$validate_log" || true
  if [ "$validate_exit" -eq 0 ]; then
    rm "$validate_log"
  else
    validate_failures=$((validate_failures + 1))
  fi

  curl_exit=0
  start=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  curl --noproxy '*' --silent --show-error --fail --http2 --output /dev/null --connect-timeout 5 --max-time 15 \
    --resolve api.apple-cloudkit.com:443:17.248.209.46 \
    --header 'Content-Type: application/json' --data "$record" \
    --write-out 'http=%{http_code} version=%{http_version} remote_ip=%{remote_ip} tcp_s=%{time_connect} tls_s=%{time_appconnect} total_s=%{time_total}\n' \
    "$endpoint" || curl_exit=$?
  echo "attempt=$attempt kind=curl-post start_utc=$start exit=$curl_exit"
  if [ "$curl_exit" -ne 0 ]; then
    curl_failures=$((curl_failures + 1))
  fi

  if [ -n "$curl_http3" ]; then
    http3_exit=0
    start=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    "$curl_http3" --noproxy '*' --silent --show-error --fail --http3-only --output /dev/null --connect-timeout 5 --max-time 15 \
      --resolve api.apple-cloudkit.com:443:17.248.209.46 \
      --header 'Content-Type: application/json' --data "$record" \
      --write-out 'http=%{http_code} version=%{http_version} remote_ip=%{remote_ip} total_s=%{time_total}\n' \
      "$endpoint" || http3_exit=$?
    echo "attempt=$attempt kind=curl-http3-post start_utc=$start exit=$http3_exit"
    if [ "$http3_exit" -ne 0 ]; then
      http3_failures=$((http3_failures + 1))
    fi
  fi
done

finish_diagnostics
trap - EXIT
echo 'CFNetwork request summaries and timeouts:'
tail -n 30 "$dir/cfnetwork-summary.txt"
if [ -s "$dir/cloudkit.pcap" ]; then
  tcpdump -n -tttt -r "$dir/cloudkit.pcap" \
    'tcp[tcpflags] & (tcp-fin|tcp-rst) != 0' \
    > "$dir/connection-closes.txt" 2>/dev/null || true
  echo "captured_connection_closes=$(wc -l < "$dir/connection-closes.txt")"
  tail -n 30 "$dir/connection-closes.txt"
fi
echo "validate_failures=$validate_failures curl_http2_post_failures=$curl_failures curl_http3_post_failures=$http3_failures"
date -u '+end_utc=%Y-%m-%dT%H:%M:%SZ'
if [ "$validate_failures" -gt 0 ] || [ "$curl_failures" -gt 0 ] || [ "$http3_failures" -gt 0 ]; then
  exit 1
fi
