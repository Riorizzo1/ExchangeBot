#!/usr/bin/env python3
from __future__ import annotations
import json, re
from pathlib import Path

ROOT=Path('/Users/bobby/.openclaw/workspace')
DATA=ROOT/'watch_desk/public/data/latest.json'
HTMLS=[ROOT/'watch_desk/public/index.html', ROOT/'watch_desk/public/v2.html']
BAD={'', 'n/a', 'price n/a', '$0', '$1'}

def load_json(p):
    return json.loads(p.read_text())

def extract_payload(text):
    start=text.index('<script>window.WATCH_DESK_V2=') + len('<script>window.WATCH_DESK_V2=')
    end=text.index(';</script>', start)
    return json.loads(text[start:end]), start, end

def bad_rwi(cards):
    r=[c for c in cards if c.get('sourceGroup')=='rwi']
    bad=[c for c in r if str(c.get('price') or '').strip().lower() in BAD]
    fake=[c for c in r if str(c.get('price') or '').strip() in ('$0','$1')]
    priced=[c for c in r if str(c.get('price') or '').strip().lower() not in BAD]
    return r,bad,fake,priced

payload=load_json(DATA)
payload=dict(payload)
payload['cards']=payload.get('currentItems') or payload.get('items') or []
blob=json.dumps(payload, ensure_ascii=True, separators=(',', ':'))

results=[]
for h in HTMLS:
    text=h.read_text(errors='ignore')
    marker='<script>window.WATCH_DESK_V2='
    start=text.index(marker) + len(marker)
    end=text.index(';</script>', start)
    new=text[:start]+blob+text[end:]
    h.write_text(new)
    parsed,_,_=extract_payload(new)
    r,bad,fake,priced=bad_rwi(parsed.get('cards') or [])
    results.append({
        'file': str(h), 'rwi': len(r), 'priced': len(priced), 'bad': len(bad), 'fake': len(fake),
        'sample_priced': [(c.get('id'), c.get('price')) for c in priced[:5]],
        'sample_bad': [(c.get('id'), c.get('price'), (c.get('title') or '')[:50]) for c in bad[:5]],
    })

r,bad,fake,priced=bad_rwi(payload.get('cards') or [])
print(json.dumps({'json': {'rwi':len(r),'priced':len(priced),'bad':len(bad),'fake':len(fake)}, 'html': results}, indent=2))
