#!/usr/bin/env python3
from __future__ import annotations
import json, re
from pathlib import Path

ROOT = Path('/Users/bobby/.openclaw/workspace')
RWI = ROOT / 'rwi_mvp' / 'data'
LATEST = ROOT / 'watch_desk' / 'public' / 'data' / 'latest.json'
TODAY = ROOT / 'watch_desk' / 'public' / 'data'

PRICE_RE = re.compile(r'^(?:[€£$]\s?\d|USD\s?\d|EUR\s?\d|GBP\s?\d)', re.I)
BAD = {'', 'n/a', 'price n/a', '$1', '$0', 'open thread', 'see thread'}

def load(path, default=None):
    try:
        return json.loads(path.read_text())
    except Exception:
        return default if default is not None else {}

def save(path, obj):
    path.write_text(json.dumps(obj, indent=2))

def tid_from_url(url=''):
    m = re.search(r'\.(\d+)(?:/)?$', str(url or ''))
    return m.group(1) if m else ''

def clean_price(p):
    if p is None:
        return ''
    s = str(p).strip()
    if s.lower() in BAD:
        return ''
    # Repair previous decimal-comma damage like €54000 from €540,00.
    m = re.match(r'^([€£$])\s?(\d{5,6})$', s)
    if m:
        n = int(m.group(2))
        if n % 100 == 0 and n > 5000:
            s = f'{m.group(1)}{n//100}'
    return s if PRICE_RE.search(s) else ''

def iter_dicts(obj):
    stack = [obj]
    while stack:
        x = stack.pop()
        if isinstance(x, dict):
            yield x
            stack.extend(x.values())
        elif isinstance(x, list):
            stack.extend(x)

def collect_price_cache():
    found = {}
    source = {}
    paths = []
    for name in ('rwi.previous.json', 'rwi.json', 'rwi_bookmarklet_current.json'):
        p = RWI / name
        if p.exists():
            paths.append(p)
    paths.extend(sorted(RWI.glob('rwi_bookmarklet_*.json'), key=lambda p: p.stat().st_mtime, reverse=True))
    paths.extend(sorted((ROOT / 'watch_desk' / 'public' / 'data').glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True))

    for path in paths:
        obj = load(path, {})
        for row in iter_dicts(obj):
            tid = str(row.get('threadId') or '').strip() or tid_from_url(row.get('threadUrl') or row.get('url') or '')
            if not tid or tid in found:
                continue
            p = clean_price(row.get('askingPrice') or row.get('price') or row.get('cost'))
            if p:
                found[tid] = p
                source[tid] = str(path)
    return found, source

def repair_payload(path, price_by_tid):
    payload = load(path, None)
    if not isinstance(payload, dict):
        return 0, 0
    repaired = 0
    still_unknown = 0
    for key in ('items', 'currentItems'):
        rows = payload.get(key)
        if not isinstance(rows, list):
            continue
        for row in rows:
            if row.get('sourceGroup') != 'rwi':
                continue
            tid = str(row.get('id') or '').replace('rwi:', '') or tid_from_url(row.get('url') or '')
            current = clean_price(row.get('price'))
            cached = price_by_tid.get(tid, '')
            if cached and (not current or row.get('priceUnknown')):
                row['price'] = cached
                row.pop('priceUnknown', None)
                repaired += 1
            elif not clean_price(row.get('price')):
                row['price'] = ''
                row['priceUnknown'] = True
                still_unknown += 1
    save(path, payload)
    return repaired, still_unknown

def main():
    price_by_tid, source = collect_price_cache()
    targets = [LATEST]
    latest = load(LATEST, {})
    date = latest.get('date')
    if date:
        dated = TODAY / f'{date}.json'
        if dated.exists() and dated not in targets:
            targets.append(dated)
    total_repaired = 0
    total_unknown = 0
    for path in targets:
        repaired, unknown = repair_payload(path, price_by_tid)
        total_repaired += repaired
        total_unknown += unknown
    print(json.dumps({
        'ok': True,
        'cached_prices': len(price_by_tid),
        'files': [str(p) for p in targets],
        'repaired': total_repaired,
        'still_unknown': total_unknown,
    }, indent=2))

if __name__ == '__main__':
    main()
