kache stats || true

# Which crates compiled instead of coming from the cache, costliest first.
# The key prefix matches `kache explain`'s, so a miss can be compared with
# the key a developer machine published for the same crate.
events="${KACHE_RUNTIME_DIR:-$KACHE_CACHE_DIR${KACHE_TRUST_DOMAIN:+/$KACHE_TRUST_DOMAIN}}/events.jsonl"
if [ -f "$events" ]; then
  echo "Costliest kache misses (compile ms, crate, key):"
  jq -r 'select(.result == "miss") | "\(.compile_time_ms // 0)\t\(.crate_name)\t\(.cache_key[0:12])"' \
    "$events" | sort -rn | head -60 || true
fi

kache daemon stop || true
