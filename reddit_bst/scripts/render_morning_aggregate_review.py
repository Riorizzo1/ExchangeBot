#!/usr/bin/env python3
import json
from collections import defaultdict
from pathlib import Path
from datetime import datetime, timezone, timedelta

SNAPSHOT = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/aggregate_snapshot.json')
OUT = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/morning_review_telegram.txt')
ET = timezone(timedelta(hours=-4))
SUBS_ORDER = ['BSTRepWatch', 'repwatchbuysell', 'repwatchbuyselltrade', 'watchexchangeBST', 'TheRepTimeBST', 'watchconnect']
LABEL_MAP = {'watchexchangeBST': 'WatchExchangeBST'}


def fmt_price(price):
    if price is None:
        return None
    price = float(price)
    return f'${int(price)}' if price.is_integer() else f'${price:.2f}'


def normalize_sub(sub):
    return LABEL_MAP.get(sub, sub)


def main():
    obj = json.loads(SNAPSHOT.read_text())
    rows = obj.get('current', [])
    generated_at = datetime.fromisoformat(obj['generated_at']).astimezone(ET)
    morning_cutoff_hour = 12
    filtered = []
    for r in rows:
        posted = (r.get('posted') or '').strip().lower()
        if r.get('status') not in ('available', 'pending'):
            continue
        filtered.append({
            'subreddit': normalize_sub(r.get('subreddit')),
            'title': (r.get('title') or '').strip(),
            'price': r.get('price'),
            'status': r.get('status'),
            'url': r.get('post_url') or r.get('url') or '',
            'seller': r.get('seller') or '',
            'posted': posted,
            'kind': (r.get('kind') or '').lower(),
            'bulk': bool(r.get('bulk')),
        })

    by_sub = defaultdict(list)
    for row in filtered:
        by_sub[row['subreddit']].append(row)

    lines = []
    lines.append(f'Morning Reddit aggregate review')
    lines.append(f'Generated: {generated_at.strftime("%-I:%M %p ET")}' )
    lines.append(f'Total active listings captured: {len(filtered)}')
    lines.append('')

    for sub in SUBS_ORDER:
        items = by_sub.get(sub, [])
        if not items:
            continue
        available = sum(1 for x in items if x['status'] == 'available')
        pending = sum(1 for x in items if x['status'] == 'pending')
        prices = [float(x['price']) for x in items if x.get('price') is not None]
        lines.append(f'{sub} ({len(items)} items, {available} available, {pending} pending)')
        if prices:
            lines.append(f'Price range: {fmt_price(min(prices))} to {fmt_price(max(prices))}')
        top = sorted(items, key=lambda x: (x['price'] is None, x['price'] if x['price'] is not None else 10**9))[:8]
        for item in top:
            line = f'• {item["title"]}'
            price = fmt_price(item.get('price'))
            if price:
                line += f', {price}'
            if item.get('status') == 'pending':
                line += ' (pending)'
            lines.append(line)
        if top:
            lines.append(f'Source sample: <{top[0]["url"]}>')
        lines.append('')

    text = '\n'.join(lines).strip() + '\n'
    OUT.write_text(text)
    print(OUT)


if __name__ == '__main__':
    main()
