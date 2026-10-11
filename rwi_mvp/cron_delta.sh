#!/bin/bash
set -euo pipefail
cd /Users/bobby/.openclaw/workspace/rwi_mvp
node run_fresh_delta.mjs > /dev/null
zsh /Users/bobby/.openclaw/workspace/watch_desk/scripts/refresh_daily_dashboard.sh rwi
