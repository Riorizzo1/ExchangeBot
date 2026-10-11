#!/bin/zsh
set -euo pipefail
cd /Users/bobby/.openclaw/workspace/reddit_bst
stamp=$(date -u +%Y-%m-%dT%H-%M-%S-%3NZ)
raw="/Users/bobby/.openclaw/workspace/reddit_bst/captures/TheRepTimeBST_direct_${stamp}.json"
parsed="/Users/bobby/.openclaw/workspace/reddit_bst/captures/TheRepTimeBST_${stamp}.json"
python3 - "$raw" <<'PY'
import json
import sys
import urllib.request
raw_path = sys.argv[1]
url = 'https://www.reddit.com/r/TheRepTimeBST/new.json?limit=100&raw_json=1'
req = urllib.request.Request(url, headers={'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=60) as resp:
    body = resp.read().decode('utf-8')
obj = {'ok': True, 'status': 200, 'body': body}
with open(raw_path, 'w') as f:
    json.dump(obj, f, indent=2)
print(raw_path)
PY
python3 /Users/bobby/.openclaw/workspace/reddit_bst/scripts/parse_direct_reddit_json.py "$raw" "$parsed"
