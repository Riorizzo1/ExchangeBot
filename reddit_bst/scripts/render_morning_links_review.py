#!/usr/bin/env python3
import json
from collections import defaultdict
from pathlib import Path

SNAPSHOT = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/aggregate_snapshot.json')
OUT = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/morning_links_review.txt')
SUBS_ORDER = ['BSTRepWatch', 'repwatchbuysell', 'repwatchbuyselltrade', 'WatchExchangeBST', 'TheRepTimeBST', 'watchconnect']
LABEL_MAP = {'watchexchangeBST': 'WatchExchangeBST'}


def normalize_sub(sub):
    return LABEL_MAP.get(sub, sub)


def fmt_price(price):
    if price is None:
        return None
    price = float(price)
    return f'${int(price)}' if price.is_integer() else f'${price:.2f}'


def main():
    obj = json.loads(SNAPSHOT.read_text())
    rows = obj.get('current', [])
    by_sub = defaultdict(list)

    for r in rows:
        status = (r.get('status') or '').lower()
        if status not in ('available', 'pending'):
            continue
        title = (r.get('title') or '').strip()
        url = r.get('post_url') or r.get('url') or ''
        if not title or not url:
            continue
        by_sub[normalize_sub(r.get('subreddit'))].append({
            'title': title,
            'url': url,
            'price': r.get('price'),
            'status': status,
        })

    lines = []
    lines.append('Morning Reddit listings review')
    lines.append('All currently surfaced listings in one place, title + link only.')
    lines.append('')

    for sub in SUBS_ORDER:
        items = by_sub.get(sub, [])
        if not items:
            continue
        seen = set()
        deduped = []
        for item in sorted(items, key=lambda x: (x['price'] is None, x['price'] if x['price'] is not None else 10**9, x['title'].lower(), x['url'])):
            key = (item['title'], item['url'])
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)

        lines.append(f'{sub} ({len(deduped)})')
        for item in deduped:
            price = fmt_price(item['price'])
            label = f'• {item["title"]}'
            if price:
                label += f' | {price}'
            if item['status'] == 'pending':
                label += ' | pending'
            lines.append(label)
            lines.append(f'<{item["url"]}>')
        lines.append('')

    OUT.write_text('\n'.join(lines).strip() + '\n')
    print(OUT)

if __name__ == '__main__':
    main()
