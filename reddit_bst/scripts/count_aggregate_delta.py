#!/usr/bin/env python3
import json
from collections import defaultdict
from pathlib import Path
rows = json.loads(Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/aggregate_delta.json').read_text())
label = {'watchexchangeBST':'WatchExchangeBST'}
counts = defaultdict(lambda: {'watch_available':0,'watch_pending':0,'acc_available':0,'acc_pending':0})
for r in rows:
    status=(r.get('status') or '').lower()
    if status not in ('available','pending'):
        continue
    sub=label.get(r.get('subreddit'),r.get('subreddit'))
    price=r.get('price')
    kind='acc' if price is not None and price <170 else 'watch'
    counts[sub][f'{kind}_{status}'] += 1
for sub in ['BSTRepWatch','repwatchbuysell','repwatchbuyselltrade','WatchExchangeBST','TheRepTimeBST']:
    c=counts.get(sub)
    if c:
        print(sub, c)
