#!/bin/zsh
set -euo pipefail
cd /Users/bobby/.openclaw/workspace/reddit_bst

cleanup() {
  openclaw browser --browser-profile openclaw stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo 'Refreshing four non-BSTRepWatch subreddits...'
node run_all_subreddit_scans.mjs

echo 'Refreshing BSTRepWatch via browser bookmarklet...'
python3 scripts/refresh_bstrepwatch_from_browser.py

echo 'Building aggregate delta...'
python3 scripts/build_reddit_aggregate_delta.py

echo 'Rendering summary...'
python3 scripts/render_aggregate_delta_telegram.py
