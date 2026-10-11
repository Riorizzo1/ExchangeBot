#!/bin/zsh
set -euo pipefail

ROOT=/Users/bobby/.openclaw/workspace
cd "$ROOT"

echo '[watch-desk] building normalized dashboard data'
python3 watch_desk/scripts/build_watch_desk.py

echo '[watch-desk] building v2 html'
python3 watch_desk/scripts/build_v2_html.py

cp watch_desk/public/v2.html watch_desk/public/index.html

echo '[watch-desk] done: http://10.0.0.186:4314/v2.html'
