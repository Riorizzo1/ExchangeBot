#!/usr/bin/env python3
import json
import time
import subprocess
from pathlib import Path

ROOT = Path('/Users/bobby/.openclaw/workspace/reddit_bst')
WRAPPED = (ROOT / 'list_sales_bookmarklet_wrapped.js').read_text()
OUT = ROOT / 'data' / 'current_from_blob.json'
WAIT_FN = """() => new Promise((resolve) => {
  const started = Date.now();
  const tick = () => {
    const v = window.__RWS_RESULTS__;
    if (v && v.rows && v.rows.length) return resolve(v);
    if (v && v.error) return resolve(v);
    if (Date.now() - started > 120000) return resolve({ error: 'timeout waiting for __RWS_RESULTS__' });
    setTimeout(tick, 1000);
  };
  tick();
})"""


def run(*args, json_mode=False):
    cmd = ['openclaw', 'browser', '--browser-profile', 'openclaw', '--timeout', '120000']
    if json_mode:
        cmd.append('--json')
    cmd.extend(args)
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout


run('start')
url = 'https://www.reddit.com/r/BSTRepWatch/'
run('open', url)
run('wait', '--url', url)
run('evaluate', '--fn', WRAPPED, json_mode=True)
raw = run('evaluate', '--fn', WAIT_FN, json_mode=True)
obj = json.loads(raw)
res = obj.get('result') or {}
rows_out = []
now = int(time.time())
for r in res.get('rows', []):
    created = int(r.get('created') or 0)
    age = max(0, now - created) if created else 0
    if created:
        if age < 3600:
            posted = f'{max(1, age // 60)}m ago'
        elif age < 86400:
            posted = f'{age // 3600}h ago'
        else:
            posted = f'{age // 86400}d ago'
    else:
        posted = ''
    prices = r.get('prices') or ([] if r.get('minPrice') is None else [r['minPrice']])
    images = r.get('images') or []
    rows_out.append({
        'summary': r.get('title') or '',
        'title': r.get('title'),
        'url': r.get('url'),
        'prices': prices,
        'images': images,
        'thumb': images[0] if images else '',
        'status': (r.get('status') or 'unknown').title().replace('Available', 'For Sale'),
        'tier': r.get('tier'),
        'factory': r.get('factory'),
        'seller': r.get('author'),
        'posted': posted,
        'is_sub_listing': bool(r.get('isSubListing')),
    })
OUT.write_text(json.dumps({'meta': {'subreddit': 'BSTRepWatch', 'count': len(rows_out)}, 'rows': rows_out}, indent=2))
print(json.dumps({'bstrepwatch_rows': len(rows_out), 'out': str(OUT), 'error': res.get('error')}, indent=2))
