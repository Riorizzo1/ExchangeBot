#!/bin/bash
set -euo pipefail
LOCK_DIR=/tmp/openclaw-browser-job.lock

acquire_lock() {
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    sleep 5
  done
}

release_lock() {
  rmdir "$LOCK_DIR" >/dev/null 2>&1 || true
}

trap release_lock EXIT

acquire_lock

cd /Users/bobby/.openclaw/workspace/rwi_mvp
mkdir -p logs
stamp="$(date +%Y%m%d-%H%M%S)"
log="logs/rwi-hourly-delta-${stamp}.log"
if ! node run_fresh_delta.mjs >"$log" 2>&1; then
  cp "$log" /tmp/rwi-hourly-delta-last.log
  cat "$log"
  exit 1
fi
cp "$log" /tmp/rwi-hourly-delta-last.log
summary="$(node render_delta_telegram.mjs 2>&1 || true)"

if ! {
  echo "--- RWI daily dashboard fold-in ---"
  node render_daily_dashboard.mjs
  echo "--- canonical Daily Delta publish (RWI) ---"
  zsh /Users/bobby/.openclaw/workspace/watch_desk/scripts/refresh_daily_dashboard.sh rwi
} >>"$log" 2>&1; then
  cp "$log" /tmp/rwi-hourly-delta-last.log
  cat "$log"
  exit 1
fi

if [ -n "$summary" ]; then
  printf '%s\n' "$summary"
else
  printf '%s\n' 'No new watches since the last hour parse.'
fi
