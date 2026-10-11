#!/usr/bin/env python3
from __future__ import annotations
import json, re
from pathlib import Path

ROOT = Path('/Users/bobby/.openclaw/workspace')
LATEST = ROOT / 'watch_desk/public/data/latest.json'
HTMLS = [ROOT / 'watch_desk/public/index.html', ROOT / 'watch_desk/public/v2.html']

payload = json.loads(LATEST.read_text())
# The PWA expects cards, not currentItems.
if 'cards' not in payload:
    if 'currentItems' in payload:
        payload = dict(payload)
        payload['cards'] = payload.get('currentItems') or payload.get('items') or []
    elif 'items' in payload:
        payload = dict(payload)
        payload['cards'] = payload.get('items') or []

blob = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
pattern = re.compile(r'<script>window\.WATCH_DESK_V2=.*?</script>', re.S)

out = {}
for path in HTMLS:
    text = path.read_text(errors='ignore')
    new, n = pattern.subn(f'<script>window.WATCH_DESK_V2={blob};</script>', text, count=1)
    if n != 1:
        raise SystemExit(f'Could not replace embedded payload in {path}; matches={n}')
    path.write_text(new)
    out[str(path)] = {'replaced': n, 'bytes': len(new), 'contains_$1': '$1' in new}

# Count RWI cards with bad display prices in the actual embedded payload we wrote.
cards = payload.get('cards') or []
rwi = [c for c in cards if c.get('sourceGroup') == 'rwi']
bad = [c for c in rwi if str(c.get('price') or '').strip().lower() in ('', 'n/a', 'price n/a', '$1', '$0')]
print(json.dumps({'ok': True, 'embedded_files': out, 'rwi_cards': len(rwi), 'bad_rwi_prices': len(bad), 'sample_bad': [(c.get('id'), c.get('price'), c.get('title','')[:60]) for c in bad[:10]]}, indent=2))
