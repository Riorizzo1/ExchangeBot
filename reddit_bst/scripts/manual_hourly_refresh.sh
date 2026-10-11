#!/bin/zsh
set -euo pipefail
cd /Users/bobby/.openclaw/workspace/reddit_bst
stamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
for sub in repwatchbuysell repwatchbuyselltrade watchexchangeBST TheRepTimeBST; do
  raw="captures/${sub}_direct_${stamp}.json"
  body=$(curl -L --silent --show-error "https://www.reddit.com/r/${sub}/new.json?limit=100&raw_json=1" | python3 -c 'import json,sys; print(json.dumps({"ok": True, "status": 200, "body": sys.stdin.read()}))')
  printf '%s\n' "$body" > "$raw"
  if [ "$sub" = "repwatchbuysell" ] || [ "$sub" = "repwatchbuyselltrade" ]; then
    python3 scripts/parse_direct_reddit_json.py "$raw" "captures/${sub}_${stamp}.json" >/dev/null
  fi
done
python3 scripts/refresh_bstrepwatch_from_browser.py
python3 scripts/build_reddit_aggregate_delta.py >/dev/null
python3 scripts/render_aggregate_delta_telegram.py
