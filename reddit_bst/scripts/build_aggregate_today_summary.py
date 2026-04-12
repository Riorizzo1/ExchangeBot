#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

ET = timezone(timedelta(hours=-4))
PRICE_RE = re.compile(r'\$\s*([0-9,]+(?:\.[0-9]{1,2})?)')
WATCH_RE = re.compile(r'rolex|omega|\bap\b|audemars|patek|iwc|tudor|panerai|breitling|cartier|submariner|gmt|daytona|seamaster|speedmaster|royal[\s\-]?oak|nautilus|portugieser|aquanaut|datejust|day[\s\-]?date|explorer|skydweller|[0-9]{5,6}|vsf|clean|\bzf\b|bbf|twf|sbf|noob|\bbp\b|arf|kvf|\bkv\b|\bom\b|diw|ewf|gdf|jjf|jvs|ddf|\bbf\b|hbb', re.I)
SKIP_RE = re.compile(r'\bups\b|\busps\b|\bfedex\b|\bpaypal\b|\bvenmo\b|\bshipping\b|\binsur|\btax\b|\bground\b|\bpriority\b|\bovernight\b', re.I)
FACTORIES = ['VSF','CLEAN','ZF','BBF','TWF','TW','SBF','BT','NOOB','BP','ARF','JVS','XF','KVF','KV','OM','GSF','JH','HBB','BF','GDF','RF','AET','DDF','JJF','GF','PF','SF','THF','DIW','BAMFORD','EWF','MKS','VR','GMF','AR','TF','RXW','U1','A1','DL','RL','F1']

def detect_factory(text):
    up = (text or '').upper()
    for f in FACTORIES:
        if f in up:
            return f
    return None

def detect_status(flair, text):
    f = (flair or '').upper()
    t = (text or '').upper()
    if any(x in f for x in ['SOLD','COMPLETE','CLOSED','TRADED']) or '[SOLD]' in t or '~~SOLD~~' in t:
        return 'sold'
    if 'PENDING' in f or '[PENDING]' in t:
        return 'pending'
    if any(x in t for x in ['[WTS]','WTS','FOR SALE','WANT TO SELL','[FS]',' FS ',' SALE ']):
        return 'available'
    return 'unknown'

def extract_prices(text):
    vals = []
    for m in PRICE_RE.findall(text or ''):
        n = float(m.replace(',',''))
        if 10 < n < 100000 and n not in vals:
            vals.append(n)
    return vals

def parse_listings(title, body):
    lines = re.split(r'[\n\r]+', body or '')
    listings = []
    for line in lines:
        clean = re.sub(r'^[•\-\+\*►▸·]\s*','', line.strip())
        if len(clean) < 10 or len(clean) > 300:
            continue
        if SKIP_RE.search(clean):
            continue
        pm = PRICE_RE.search(clean)
        if not pm:
            continue
        price = float(pm.group(1).replace(',',''))
        if price < 50 or price > 100000:
            continue
        if WATCH_RE.search(clean):
            listings.append({'title': clean[:150], 'price': price})
    return listings

def load_rows(path):
    data = json.loads(Path(path).read_text())
    if 'rows' in data and isinstance(data['rows'], list):
        if data['rows'] and 'created' in data['rows'][0]:
            return data['rows']
        return data['rows']
    if 'body' in data:
        raw = json.loads(data['body'])
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
            created = p.get('created_utc') or 0
            listings = parse_listings(title, body)
            if len(listings) >= 2:
                for listing in listings:
                    rows.append({'title': listing['title'], 'url': post_url, 'status': status, 'minPrice': listing['price'], 'created': created})
            else:
                prices = extract_prices(title + ' ' + body)
                rows.append({'title': title, 'url': post_url, 'status': status, 'minPrice': min(prices) if prices else None, 'created': created})
        return rows
    raise SystemExit(f'Unsupported file format: {path}')

def summarize(label, rows):
    out = {'watches': [], 'accessories': []}
    for r in rows:
        created = datetime.fromtimestamp(r.get('created', 0), tz=timezone.utc).astimezone(ET)
        if created.date().isoformat() != '2026-04-12':
            continue
        if r.get('status') not in ('available', 'pending'):
            continue
        price = r.get('minPrice')
        item = {
            'price': price,
            'status': r.get('status'),
            'title': r.get('title'),
            'url': r.get('url'),
        }
        if price is not None and price < 170:
            out['accessories'].append(item)
        else:
            out['watches'].append(item)
    out['watches'].sort(key=lambda x: (x['price'] if x['price'] is not None else 10**9, x['title'] or ''))
    out['accessories'].sort(key=lambda x: (x['price'] if x['price'] is not None else 10**9, x['title'] or ''))
    return {'subreddit': label, **out}

def main(argv):
    mapping = [arg.split('=', 1) for arg in argv[1:]]
    payload = []
    for label, file_path in mapping:
        payload.append(summarize(label, load_rows(file_path)))
    print(json.dumps(payload, indent=2))

if __name__ == '__main__':
    main(sys.argv)
