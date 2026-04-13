#!/usr/bin/env python3
import json
import re
from pathlib import Path
from collections import defaultdict

SRC = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/aggregate_delta.json')
rows = json.loads(SRC.read_text())

SUBS_ORDER = ['BSTRepWatch', 'repwatchbuysell', 'repwatchbuyselltrade', 'WatchExchangeBST', 'TheRepTimeBST']
LABEL_MAP = {'watchexchangeBST': 'WatchExchangeBST'}
STATUS_ORDER = ['available', 'pending']

PREFIX_RE = re.compile(r'^(\[WTS\]|\[WTS\]\[CONUS\]|\[WTS\]\[US\]|\[WTS\]\[USA\]|\[FS\]\[USA\]|\[WTS\]\s*\[CONUS\]|\[WTS\]\s*\[US\]|\[WTS\]\s*\[EU\]|\[WTS\]\s*\[UK\]|\[WTS\]\s*\[WW\]|\[FS\]|\[WTS\]|WTS\s*[:\-]?|WTS\s+|FOR SALE\s*[:\-]?)\s*', re.I)
SELLER_CODE_RE = re.compile(r'\s*✅\s*Seller Code:\s*\d+.*$', re.I)
BRAND_NEW_RE = re.compile(r'\s*[-–]?\s*brand new\b', re.I)
SHIPPING_RE = re.compile(r'\s*[-–]?\s*shipped\b', re.I)
PRICE_INLINE_RE = re.compile(r'\s*=?\$\s*([0-9]+(?:\.[0-9]+)?)')
MULTISPACE_RE = re.compile(r'\s+')
LEADING_ENUM_RE = re.compile(r'^\d+[\.)-]\s*')
LEADING_DASH_RE = re.compile(r'^[-–]\s*')


def normalize_sub(sub):
    return LABEL_MAP.get(sub, sub)


def clean_title(title):
    t = ' '.join((title or '').split())
    t = PREFIX_RE.sub('', t)
    t = LEADING_ENUM_RE.sub('', t)
    t = LEADING_DASH_RE.sub('', t)
    t = SELLER_CODE_RE.sub('', t)
    t = BRAND_NEW_RE.sub('', t)
    t = SHIPPING_RE.sub('', t)
    t = PRICE_INLINE_RE.sub('', t)
    t = t.replace('!=', '')
    t = t.replace('•', ' ')
    t = MULTISPACE_RE.sub(' ', t).strip(' -,:')
    return t or title


def fmt_price(price):
    if price is None:
        return None
    if isinstance(price, (int, float)) and float(price).is_integer():
        return f'${int(price)}'
    return f'${price}'


keep = []
for r in rows:
    status = (r.get('status') or '').lower()
    if status not in ('available', 'pending'):
        continue
    price = r.get('price')
    keep.append({
        'subreddit': normalize_sub(r.get('subreddit')),
        'status': status,
        'kind': 'Accessory' if price is not None and price < 170 else 'Watch',
        'title': clean_title(r.get('title') or ''),
        'raw_title': ' '.join((r.get('title') or '').split()),
        'price': price,
        'url': r.get('url') or '',
        'posted': r.get('posted') or '',
        'seller': r.get('seller') or '',
    })

if not keep:
    print('No new available or pending items since the prior baseline/delta pass.')
    raise SystemExit

by_status = defaultdict(list)
for r in keep:
    by_status[r['status']].append(r)

parts = []
for status in STATUS_ORDER:
    rows_for_status = by_status.get(status, [])
    if not rows_for_status:
        continue
    parts.append('AVAILABLE' if status == 'available' else 'PENDING')
    parts.append('')

    by_sub = defaultdict(list)
    for r in rows_for_status:
        by_sub[r['subreddit']].append(r)

    for sub in SUBS_ORDER:
        items = by_sub.get(sub, [])
        if not items:
            continue
        parts.append(sub)

        by_kind = defaultdict(list)
        for r in items:
            by_kind[r['kind']].append(r)

        for kind in ['Watch', 'Accessory']:
            kind_items = by_kind.get(kind, [])
            if not kind_items:
                continue

            if kind == 'Accessory':
                parts.append('Accessories')

            by_url = defaultdict(list)
            for r in kind_items:
                by_url[r['url']].append(r)

            url_groups = sorted(by_url.items(), key=lambda kv: max(x['posted'] for x in kv[1]), reverse=True)
            for url, group in url_groups:
                group = sorted(group, key=lambda x: (x['price'] is None, x['price'] if x['price'] is not None else 10**9, x['title']))
                if len(group) == 1:
                    item = group[0]
                    price = fmt_price(item['price'])
                    line = f'- {item["title"]}'
                    if price:
                        line += f', {price}'
                    parts.append(line)
                    parts.append(f'  Source: <{url}>')
                    continue

                prices = [g['price'] for g in group if g['price'] is not None]
                bulk_label = 'Bulk post' if kind == 'Watch' else 'Packaging/accessory post'
                if prices:
                    summary = f'- {bulk_label}, {len(group)} items, from {fmt_price(min(prices))} to {fmt_price(max(prices))}'
                else:
                    summary = f'- {bulk_label}, {len(group)} items'
                parts.append(summary)
                parts.append(f'  Source: <{url}>')

                preview_limit = 12 if kind == 'Watch' else 6
                for child in group[:preview_limit]:
                    price = fmt_price(child['price'])
                    child_line = f'  - {child["title"]}'
                    if price:
                        child_line += f', {price}'
                    parts.append(child_line)
                if len(group) > preview_limit:
                    parts.append(f'  - and {len(group) - preview_limit} more')

            parts.append('')

        if parts and parts[-1] != '':
            parts.append('')

text = '\n'.join(parts).strip()
print(text)
