#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

WATCH_RE = re.compile(r'rolex|omega|\bap\b|audemars|patek|iwc|tudor|panerai|breitling|cartier|submariner|gmt|daytona|seamaster|speedmaster|royal[\s\-]?oak|nautilus|portugieser|aquanaut|datejust|day[\s\-]?date|explorer|skydweller|[0-9]{5,6}|vsf|clean|\bzf\b|bbf|twf|sbf|noob|\bbp\b|arf|kvf|\bkv\b|\bom\b|diw|ewf|gdf|jjf|jvs|ddf|\bbf\b|hbb', re.I)
SKIP_RE = re.compile(r'\bups\b|\busps\b|\bfedex\b|\bpaypal\b|\bvenmo\b|\bshipping\b|\binsur|\btax\b|\bground\b|\bpriority\b|\bovernight\b', re.I)
PRICE_RE = re.compile(r'\$\s*([0-9,]+(?:\.[0-9]{1,2})?)')
FACTORIES = ['VSF','CLEAN','ZF','BBF','TWF','TW','SBF','BT','NOOB','BP','ARF','JVS','XF','KVF','KV','OM','GSF','JH','HBB','BF','GDF','RF','AET','DDF','JJF','GF','PF','SF','THF','DIW','BAMFORD','EWF','MKS','VR','GMF','AR','TF','RXW','U1','A1','DL','RL','F1']
FACTORY_TIER = {'VSF':'elite','CLEAN':'elite','ZF':'elite','BBF':'elite','TW':'elite','TWF':'elite','SBF':'elite','BT':'elite','NOOB':'high','BP':'high','ARF':'high','JVS':'high','XF':'high','KV':'high','KVF':'high','OM':'high','GSF':'high','JH':'high','HBB':'high','BF':'high','GDF':'high','RF':'high','AET':'high','DDF':'high','JJF':'high','GF':'high','PF':'high','SF':'high','THF':'high','DIW':'high','BAMFORD':'high','EWF':'high','MKS':'high','VR':'high','GMF':'high','AR':'mid','TF':'mid','RXW':'mid','U1':'low','A1':'low','DL':'low','RL':'low','F1':'low'}

def detect_factory(text):
    up = text.upper()
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
            listings.append({'description': clean[:150], 'price': price})
    return listings

def main(inp, outp):
    payload = json.loads(Path(inp).read_text())
    raw = json.loads(payload['body'])
    rows = []
    for child in raw.get('data', {}).get('children', []):
        p = child.get('data', {})
        if not p or p.get('stickied'):
            continue
        title = p.get('title') or ''
        body = p.get('selftext') or ''
        flair = (p.get('link_flair_text') or '') + (p.get('link_flair_css_class') or '')
        combined = (title + ' ' + body).upper()
        factory = detect_factory(combined)
        status = detect_status(flair, title + ' ' + body)
        post_url = 'https://www.reddit.com' + (p.get('permalink') or '')
        created = p.get('created_utc') or 0
        listings = parse_listings(title, body)
        if len(listings) >= 2:
            for listing in listings:
                lf = detect_factory(listing['description'])
                uf = lf or factory
                rows.append({
                    'url': post_url,
                    'title': listing['description'],
                    'parentTitle': title[:120],
                    'isSubListing': True,
                    'factory': uf,
                    'tier': FACTORY_TIER.get(uf, 'unknown') if uf else 'unknown',
                    'status': status,
                    'prices': [listing['price']],
                    'minPrice': listing['price'],
                    'author': p.get('author') or '',
                    'created': created,
                })
        else:
            prices = extract_prices(title + ' ' + body)
            rows.append({
                'url': post_url,
                'title': title,
                'parentTitle': None,
                'isSubListing': False,
                'factory': factory,
                'tier': FACTORY_TIER.get(factory, 'unknown') if factory else 'unknown',
                'status': status,
                'prices': prices,
                'minPrice': min(prices) if prices else None,
                'author': p.get('author') or '',
                'created': created,
            })
    Path(outp).write_text(json.dumps({'rows': rows}, indent=2))
    print(json.dumps({'rows': len(rows), 'out': outp}, indent=2))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
