#!/bin/zsh
set -euo pipefail
cd /Users/bobby/.openclaw/workspace/reddit_bst

LOCK_DIR=/tmp/openclaw-browser-job.lock

acquire_lock() {
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    sleep 5
  done
}

release_lock() {
  rmdir "$LOCK_DIR" >/dev/null 2>&1 || true
}

cleanup() {
  release_lock
  openclaw browser --browser-profile openclaw stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

acquire_lock

echo 'Refreshing five non-BSTRepWatch subreddits...' >&2
node run_all_subreddit_scans.mjs >&2

echo 'Refreshing BSTRepWatch via browser bookmarklet...' >&2
openclaw browser --browser-profile openclaw stop >/dev/null 2>&1 || true
python3 scripts/refresh_bstrepwatch_from_browser.py >&2

echo 'Building aggregate delta...' >&2
python3 scripts/build_reddit_aggregate_delta.py >&2

echo 'Rendering summary...' >&2
summary="$(python3 scripts/render_aggregate_delta_telegram.py)"

echo 'Publishing canonical Daily Delta board (Reddit)...' >&2
/Users/bobby/.openclaw/workspace/watch_desk/scripts/refresh_daily_dashboard.sh reddit >&2

echo 'Stopping browser...' >&2
openclaw browser --browser-profile openclaw stop >/dev/null 2>&1 || true

if [ -n "$summary" ]; then
  printf '%s\n' "$summary"
else
  printf '%s\n' 'No new Reddit BST items since the last hour parse.'
fi
