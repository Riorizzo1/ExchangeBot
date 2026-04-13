#!/usr/bin/env python3
import json
import re
from pathlib import Path
from datetime import datetime, timezone, timedelta

ROOT = Path('/Users/bobby/.openclaw/workspace/reddit_bst')
CAPTURES = ROOT / 'captures'
DATA = ROOT / 'data'
CURRENT = DATA / 'aggregate_current.json'
PREVIOUS = DATA / 'aggregate_previous.json'
DELTA = DATA / 'aggregate_delta.json'

ET = timezone(timedelta(hours=-4))
PRICE_RE = re.compile(r'\$\s*([0-9,]+(?:\.[0-9]{1,2})?)')
WATCH_RE = re.compile(r'rolex|omega|\bap\b|audemars|patek|iwc|tudor|panerai|breitling|cartier|submariner|gmt|daytona|seamaster|speedmaster|royal[\s\-]?oak|nautilus|portugieser|aquanaut|datejust|day[\s\-]?date|explorer|skydweller|[0-9]{5,6}|vsf|clean|\bzf\b|bbf|twf|sbf|noob|\bbp\b|arf|kvf|\bkv\b|\bom\b|diw|ewf|gdf|jjf|jvs|ddf|\bbf\b|hbb', re.I)
SKIP_RE = re.compile(r'\bups\b|\busps\b|\bfedex\b|\bpaypal\b|\bvenmo\b|\bshipping\b|\binsur|\btax\b|\bground\b|\bpriority\b|\bovernight\b', re.I)


def extract_prices(text):
    vals = []
    for m in PRICE_RE.findall(text or ''):
        n = float(m.replace(',', ''))
        if 10 < n < 100000 and n not in vals:
            vals.append(n)
    return vals


def detect_status(flair, text):
    f = (flair or '').upper()
    t = (text or '').upper()
    if any(x in f for x in ['SOLD', 'COMPLETE', 'CLOSED', 'TRADED']) or '[SOLD]' in t or '~~SOLD~~' in t:
        return 'sold'
    if 'PENDING' in f or '[PENDING]' in t:
        return 'pending'
    if any(x in t for x in ['[WTS]', 'WTS', 'FOR SALE', 'WANT TO SELL', '[FS]', ' FS ', ' SALE ']):
        return 'available'
    return 'unknown'


def parse_listings(title, body):
    lines = re.split(r'[\n\r]+', body or '')
    listings = []
    for line in lines:
        clean = re.sub(r'^[•\-\+\*►▸·]\s*', '', line.strip())
        if len(clean) < 10 or len(clean) > 300:
            continue
        if SKIP_RE.search(clean):
            continue
        pm = PRICE_RE.search(clean)
        if not pm:
            continue
        price = float(pm.group(1).replace(',', ''))
        if price < 50 or price > 100000:
            continue
        if WATCH_RE.search(clean):
            listings.append({'title': clean[:150], 'price': price})
    return listings


def latest(pattern):
    matches = sorted(CAPTURES.glob(pattern))
    return matches[-1] if matches else None


def load_bstrepwatch():
    path = ROOT / 'data' / 'current_from_blob.json'
    if not path.exists():
        return []
    obj = json.loads(path.read_text())
    rows = []
    for r in obj.get('rows', []):
        posted = r.get('posted') or ''
        if not any(x in posted for x in ['m ago', 'h ago']):
            continue
        price = min(r.get('prices') or [10**9]) if r.get('prices') else None
        rows.append({
            'subreddit': 'BSTRepWatch',
            'title': r.get('title'),
            'url': r.get('url'),
            'status': (r.get('status') or '').lower().replace('for sale', 'available'),
            'price': price,
            'posted': posted,
            'seller': r.get('seller'),
            'source': str(path),
        })
    return rows


def load_bookmarklet_capture(path, subreddit):
    obj = json.loads(path.read_text())
    rows = []
    for r in obj.get('rows', []):
        created = datetime.fromtimestamp(r.get('created', 0), tz=timezone.utc).astimezone(ET)
        price = r.get('minPrice')
        rows.append({
            'subreddit': subreddit,
            'title': r.get('title'),
            'url': r.get('url'),
            'status': r.get('status'),
            'price': price,
            'posted': created.isoformat(),
            'seller': r.get('author'),
            'source': str(path),
        })
    return rows


def load_direct_capture(path, subreddit):
    obj = json.loads(path.read_text())
    raw = json.loads(obj.get('body', '{}'))
    rows = []
    for child in raw.get('data', {}).get('children', []):
        p = child.get('data', {})
        if not p or p.get('stickied'):
            continue
        title = p.get('title') or ''
        body = p.get('selftext') or ''
        flair = (p.get('link_flair_text') or '') + (p.get('link_flair_css_class') or '')
        status = detect_status(flair, title + ' ' + body)
        post_url = 'https://www.reddit.com' + (p.get('permalink') or '')
        created = datetime.fromtimestamp(p.get('created_utc') or 0, tz=timezone.utc).astimezone(ET)
        listings = parse_listings(title, body)
        if len(listings) >= 2:
            for listing in listings:
                rows.append({
                    'subreddit': subreddit,
                    'title': listing['title'],
                    'url': post_url,
                    'status': status,
                    'price': listing['price'],
                    'posted': created.isoformat(),
                    'seller': p.get('author'),
                    'source': str(path),
                })
        else:
            prices = extract_prices(title + ' ' + body)
            rows.append({
                'subreddit': subreddit,
                'title': title,
                'url': post_url,
                'status': status,
                'price': min(prices) if prices else None,
                'posted': created.isoformat(),
                'seller': p.get('author'),
                'source': str(path),
            })
    return rows


def canonicalize(rows):
    out = []
    for r in rows:
        price = r.get('price')
        kind = 'accessory' if price is not None and price < 170 else 'watch'
        out.append({
            'subreddit': r.get('subreddit'),
            'title': r.get('title'),
            'url': r.get('url'),
            'status': r.get('status'),
            'price': price,
            'kind': kind,
            'posted': r.get('posted'),
            'seller': r.get('seller'),
            'source': r.get('source'),
        })
    return out


def row_key(r):
    return (
        r.get('subreddit'),
        r.get('title'),
        r.get('url'),
        r.get('status'),
        r.get('price'),
        r.get('seller'),
    )


def load_previous():
    if not PREVIOUS.exists():
        return []
    return json.loads(PREVIOUS.read_text())


def main():
    all_rows = []
    all_rows.extend(load_bstrepwatch())

    for sub in ['repwatchbuysell', 'repwatchbuyselltrade']:
        p = latest(f'{sub}_*.json')
        if p:
            all_rows.extend(load_bookmarklet_capture(p, sub))

    for sub in ['watchexchangeBST', 'TheRepTimeBST']:
        p = latest(f'{sub}_direct_*.json')
        if p:
            all_rows.extend(load_direct_capture(p, sub))

    current = canonicalize(all_rows)
    current.sort(key=lambda r: (r['subreddit'], r['posted'] or '', r['title'] or ''), reverse=True)
    previous = load_previous()
    prev_keys = {row_key(r) for r in previous}
    delta = [r for r in current if row_key(r) not in prev_keys]

    CURRENT.write_text(json.dumps(current, indent=2))
    DELTA.write_text(json.dumps(delta, indent=2))
    if not PREVIOUS.exists():
        PREVIOUS.write_text(json.dumps(current, indent=2))

    print(json.dumps({
        'current_count': len(current),
        'previous_count': len(previous),
        'delta_count': len(delta),
        'current_out': str(CURRENT),
        'delta_out': str(DELTA),
        'previous_out': str(PREVIOUS),
        'baseline_initialized': not bool(previous),
    }, indent=2))


if __name__ == '__main__':
    main()
