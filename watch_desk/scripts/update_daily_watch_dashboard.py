#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path('/Users/bobby/.openclaw/workspace')
PUBLIC = ROOT / 'watch_desk' / 'public'
STATE_PATH = PUBLIC / 'data' / 'daily_watch_dashboard.json'
REDDIT_DELTA_PATH = ROOT / 'reddit_bst' / 'data' / 'aggregate_delta.json'
RWI_DELTA_PATH = ROOT / 'rwi_mvp' / 'delta_compare.mjs.out.json'
RWI_CURRENT_PATH = ROOT / 'rwi_mvp' / 'data' / 'rwi.json'
ET = timezone(timedelta(hours=-4))
WINDOW_START = 7
WINDOW_END = 23
CONTRACT_VERSION = 2


def now_et() -> datetime:
    return datetime.now(ET)


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except Exception:
        return default


def fresh_state(day: str, now: datetime):
    return {
        'contractVersion': CONTRACT_VERSION,
        'day': day,
        'window': {'startHour': WINDOW_START, 'endHour': WINDOW_END},
        'updatedAt': now.isoformat(),
        'reddit': [],
        'rwi': [],
    }


def normalize_reddit_row(row: dict, now: datetime) -> dict:
    price = row.get('price')
    if isinstance(price, (int, float)):
        price = f'${price:g}' if not float(price).is_integer() else f'${int(price)}'
    return {
        'id': row.get('listing_id') or row.get('post_url') or row.get('url') or row.get('title'),
        'groupKey': row.get('post_url') or row.get('url') or row.get('listing_id'),
        'source': 'reddit',
        'sourceLabel': f"Reddit / {row.get('subreddit') or 'Reddit'}",
        'status': row.get('status') or 'unknown',
        'title': row.get('title') or row.get('source_post_title') or 'Untitled',
        'price': price,
        'seller': row.get('seller') or '',
        'posted': row.get('posted') or '',
        'url': row.get('post_url') or row.get('url') or '',
        'subreddit': row.get('subreddit') or '',
        'kind': row.get('kind') or 'watch',
        'bulk': bool(row.get('bulk')),
        # Preserve the source delta ledger's discovery time when importing it.
        # It keeps a migrated board in meaningful chronological order instead
        # of making every imported card look as though it appeared at once.
        'firstSeenAt': row.get('firstSeenAt') or now.isoformat(),
        'lastSeenAt': row.get('lastSeenAt') or now.isoformat(),
    }


def normalize_rwi_row(row: dict, now: datetime) -> dict:
    price = row.get('cost')
    if not price and row.get('priceValue') is not None:
        price = f"${row.get('priceValue'):g}" if not float(row.get('priceValue')).is_integer() else f"${int(row.get('priceValue'))}"
    return {
        'id': str(row.get('threadId') or row.get('threadUrl') or row.get('watch') or row.get('title') or ''),
        'groupKey': row.get('threadUrl') or row.get('threadId') or row.get('watch') or row.get('title'),
        'source': 'rwi',
        'sourceLabel': 'RWI',
        'status': row.get('status') or 'unknown',
        'title': row.get('watch') or row.get('title') or 'Untitled',
        'price': price or '',
        'seller': row.get('author') or '',
        'posted': row.get('posted') or '',
        'url': row.get('threadUrl') or '',
        'threadId': str(row.get('threadId') or ''),
        'bulk': False,
        'firstSeenAt': now.isoformat(),
        'lastSeenAt': now.isoformat(),
    }


def normalize_rwi_status(value: str, title: str = '') -> str:
    text = f'{value or ""} {title or ""}'.upper()
    if 'SOLD' in text or 'COMPLETE' in text or 'CLOSED' in text:
        return 'sold'
    if 'PENDING' in text or 'RESERVED' in text or 'HOLD' in text:
        return 'pending'
    if 'FOR SALE' in text or 'PRICE DROP' in text or 'PRICEDROP' in text or 'WTS' in text:
        return 'available'
    return ''


def normalize_rwi_threads(threads: list[dict], now: datetime) -> list[dict]:
    rows = []
    for row in threads or []:
        normalized_status = normalize_rwi_status(str(row.get('status') or ''), str(row.get('title') or ''))
        if not normalized_status:
            continue
        rows.append(normalize_rwi_row({
            'threadId': row.get('threadId'),
            'threadUrl': row.get('threadUrl'),
            'title': row.get('title'),
            'watch': row.get('title'),
            'cost': row.get('askingPrice'),
            'author': row.get('author'),
            'status': normalized_status,
            'posted': row.get('threadTime') or row.get('startDate') or '',
        }, now))
    return rows


def merge_rows(existing: list[dict], incoming: list[dict], key_field: str) -> list[dict]:
    by_id = {str(row.get(key_field) or row.get('id') or ''): row for row in existing if row.get(key_field) or row.get('id')}
    for row in incoming:
        rid = str(row.get(key_field) or row.get('id') or '')
        if not rid:
            continue
        if rid in by_id:
            prev = by_id[rid]
            first_seen = prev.get('firstSeenAt') or row.get('firstSeenAt')
            seen_count = int(prev.get('seenCount') or 1) + 1
            prev.update({k: v for k, v in row.items() if k != 'firstSeenAt'})
            prev['firstSeenAt'] = first_seen
            prev['lastSeenAt'] = row['lastSeenAt']
            prev['seenCount'] = seen_count
        else:
            row['seenCount'] = 1
            by_id[rid] = row
    return sorted(by_id.values(), key=lambda r: r.get('firstSeenAt') or r.get('lastSeenAt') or '', reverse=True)


def normalize_saved_rwi_rows(rows: list[dict]) -> list[dict]:
    for row in rows:
        normalized_status = normalize_rwi_status(str(row.get('status') or ''), str(row.get('title') or ''))
        if normalized_status:
            row['status'] = normalized_status
    return rows


def hydrate_rwi_prices(rows: list[dict]) -> list[dict]:
    """Refresh display prices from the accepted crawl without adding listings.

    The daily ledger is the authority for which threads belong on the Daily
    Delta.  The accepted snapshot is used only to correct an already-present
    price, which clears earlier extractor fallback values without turning the
    complete catalog into Daily Delta cards.
    """
    current = load_json(RWI_CURRENT_PATH, {})
    threads = current.get('threads') if isinstance(current, dict) else []
    by_id = {str(x.get('threadId')): x for x in threads or [] if x.get('threadId')}
    for row in rows:
        live = by_id.get(str(row.get('threadId') or row.get('id') or ''))
        if live and live.get('askingPrice'):
            row['price'] = live['askingPrice']
    return rows


def main() -> int:
    source = (sys.argv[1] if len(sys.argv) > 1 else '').strip().lower()
    if source not in {'reddit', 'rwi'}:
        print('Usage: update_daily_watch_dashboard.py <reddit|rwi>', file=sys.stderr)
        return 1

    now = now_et()
    if source == 'reddit' and (now.hour < WINDOW_START or now.hour > WINDOW_END):
        print(json.dumps({'ok': True, 'skipped': True, 'reason': 'outside-window', 'hour': now.hour}))
        return 0

    day = now.date().isoformat()
    state = load_json(STATE_PATH, None)
    if not isinstance(state, dict) or state.get('day') != day:
        state = fresh_state(day, now)
    elif state.get('contractVersion') != CONTRACT_VERSION:
        # v1's RWI fold-in imported the entire active catalog each hour. Retain
        # the accumulated Reddit deltas, but reset RWI to the actual per-day
        # RWI delta ledger before continuing with the v2 contract.
        legacy_reddit = state.get('reddit') if isinstance(state.get('reddit'), list) else []
        state = fresh_state(day, now)
        state['reddit'] = legacy_reddit
        daily_rwi = load_json(ROOT / 'rwi_mvp' / 'data' / 'daily_dashboard.json', {})
        if daily_rwi.get('day') == day and isinstance(daily_rwi.get('items'), list):
            state['rwi'] = merge_rows(
                [],
                [normalize_rwi_row(row, now) for row in daily_rwi['items']],
                'id',
            )

    if source == 'reddit':
        payload = load_json(REDDIT_DELTA_PATH, [])
        if not isinstance(payload, list):
            payload = []
        incoming = [normalize_reddit_row(row, now) for row in payload]
        state['reddit'] = merge_rows(state.get('reddit', []), incoming, 'id')
    else:
        # RWI's accepted crawl is the complete catalog. Daily Delta must consume
        # only the validated hourly change set, never that full snapshot.
        payload = load_json(RWI_DELTA_PATH, {})
        rows = payload.get('rows') if isinstance(payload, dict) else []
        incoming = [normalize_rwi_row({**row, 'status': normalize_rwi_status(str(row.get('status') or ''), str(row.get('watch') or row.get('title') or ''))}, now) for row in rows if normalize_rwi_status(str(row.get('status') or ''), str(row.get('watch') or row.get('title') or ''))]
        state['rwi'] = hydrate_rwi_prices(
            normalize_saved_rwi_rows(merge_rows(state.get('rwi', []), incoming, 'id'))
        )

    state['updatedAt'] = now.isoformat()
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2))

    print(json.dumps({
        'ok': True,
        'source': source,
        'day': day,
        'redditCount': len(state.get('reddit', [])),
        'rwiCount': len(state.get('rwi', [])),
        'statePath': str(STATE_PATH),
    }, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
