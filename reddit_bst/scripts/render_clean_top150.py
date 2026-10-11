#!/usr/bin/env python3
import json
import re
from pathlib import Path

TOP150 = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/top150_current.json')


def clean_name(name: str) -> str:
    s = name or 'Unknown'
    s = re.sub(r'✅\s*Seller\s*Code\s*:?\s*\d+', '', s, flags=re.I)
    s = re.sub(r'\bSeller\s*Code\s*:?\s*\d+', '', s, flags=re.I)
    s = re.sub(r'^\s*\d+\.\s*', '', s)
    s = re.sub(r'^\s*[\[{(]?WTS[\]})]?\s*', '', s, flags=re.I)
    s = re.sub(r'^\s*[\[{(]?CONUS[\]})]?\s*', '', s, flags=re.I)
    s = re.sub(r'^\s*[-–—]+\s*', '', s)
    s = re.sub(r'\bfor\s*\$?\d+[\d,]*(?:\s*shipped)?', '', s, flags=re.I)
    s = re.sub(r'\$\d+[\d,]*(?:\s*shipped)?', '', s, flags=re.I)
    s = re.sub(r'\bbrand new\b', '', s, flags=re.I)
    s = re.sub(r'\bnew & stickered\b', '', s, flags=re.I)
    s = re.sub(r'\bwith clone movement\b', '', s, flags=re.I)
    s = re.sub(r'\bMint\. Worn once\.?', '', s, flags=re.I)
    s = re.sub(r'\baka\s+', 'aka ', s, flags=re.I)
    s = re.sub(r'\s+', ' ', s)
    return s.strip(' -–—,')


def canonical_name(name: str) -> str:
    s = clean_name(name).lower()
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def load_rows():
    return json.loads(TOP150.read_text())


def cheapest_for_sale(limit=25):
    rows = load_rows()
    best = {}
    for r in rows:
        status = (r.get('status') or '').strip().lower()
        if status != 'for sale':
            continue
        prices = r.get('prices') or []
        if not prices:
            continue
        price = min(prices)
        cleaned = clean_name(r.get('title') or 'Unknown')
        canon = canonical_name(cleaned)
        if not canon:
            continue
        existing = best.get(canon)
        candidate = {
            'status': 'FOR SALE',
            'price': price,
            'name': cleaned,
            'url': r.get('url') or '',
            'posted': r.get('posted') or '',
        }
        if existing is None or price < existing['price'] or (price == existing['price'] and candidate['posted'] < existing['posted']):
            best[canon] = candidate
    out = sorted(best.values(), key=lambda r: (r['price'], r['name'].lower()))
    return out[:limit]


def main():
    for row in cheapest_for_sale():
        print(f"({row['status']}) ${row['price']} - **{row['name']}**")
        print(row['url'])
        print()


if __name__ == '__main__':
    main()
