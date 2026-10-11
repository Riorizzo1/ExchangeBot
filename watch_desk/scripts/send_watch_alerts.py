#!/usr/bin/env python3
"""Send deduplicated Daily Delta and low-price watch alerts through the Daily Delta push channel."""
from __future__ import annotations

import json
import hashlib
import time
import fcntl
from datetime import datetime
from build_daily_lite import crosspost_key
import re
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path('/Users/bobby/.openclaw/workspace')
LATEST = ROOT / 'watch_desk/public/data/latest.json'
PWA_MANIFEST = ROOT / 'watch_desk/public/daily/data/manifest.json'
PWA_CATALOG = ROOT / 'watch_desk/public/daily/data/catalog.json'
STATE = ROOT / 'watch_desk/data/watch-alert-state.json'
FX_CACHE = ROOT / 'watch_desk/data/fx-usd-cache.json'
PUSH_URL = 'http://127.0.0.1:4318/api/push/watch/send'
DAILY_DELTA_URL = 'https://dailydelta.bobs-apps.com/daily/'
LIMIT_USD = 400.0
FALLBACK_RATES = {'USD': 1.0, 'GBP': 1.35, 'EUR': 1.17, 'CAD': 0.72, 'AUD': 0.66}


def load(path: Path, fallback):
    try:
        return json.loads(path.read_text())
    except Exception:
        return fallback


def save(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2))
    temporary.replace(path)


def rates():
    cached = load(FX_CACHE, {})
    try:
        req = Request('https://api.frankfurter.app/latest?from=USD&to=GBP,EUR,CAD,AUD', headers={'User-Agent': 'ClarenceWatchAlerts/1.0'})
        with urlopen(req, timeout=8) as response:
            data = json.loads(response.read().decode())
        values = {'USD': 1.0, **{k: float(v) for k, v in (data.get('rates') or {}).items()}}
        save(FX_CACHE, {'rates': values, 'date': data.get('date')})
        return values
    except Exception:
        return cached.get('rates') or FALLBACK_RATES


PRICE_RE = re.compile(r'(?P<currency>USD|GBP|EUR|CAD|AUD|[$£€])?\s*(?P<amount>\d[\d,]*(?:\.\d+)?)', re.I)


def prices(text: str, source: str, fx: dict):
    found = []
    for match in PRICE_RE.finditer(str(text or '')):
        raw_currency = (match.group('currency') or '').upper()
        currency = {'$': 'USD', '£': 'GBP', '€': 'EUR'}.get(raw_currency, raw_currency)
        if not currency:
            currency = 'GBP' if source == 'rwi' else 'USD'
        amount = float(match.group('amount').replace(',', ''))
        if amount <= 0 or amount > 100000:
            continue
        # The FX endpoint returns foreign-currency units per USD (for example,
        # GBP=0.75 means $1 = £0.75). Convert a foreign price back to USD by
        # dividing; USD itself remains unchanged.
        rate = float(fx.get(currency, 1.0))
        usd_amount = amount if currency == 'USD' else amount / rate
        found.append((usd_amount, currency, amount))
    return found


def usd_value(item: dict, fx: dict):
    values = prices(item.get('price'), str(item.get('sourceGroup') or item.get('source') or '').lower(), fx)
    return min(values, default=(None, '', None))


def pwa_listing_id(item: dict):
    """Translate source IDs into the IDs used by the published Daily Delta PWA."""
    source = str(item.get('sourceGroup') or item.get('source') or '').lower()
    title = str(item.get('title') or '')
    seller = str(item.get('seller') or '')
    posted = str(item.get('postedAt') or '')
    candidates = []
    for path in (PWA_MANIFEST, PWA_CATALOG):
        payload = load(path, {})
        candidates.extend(payload.get('today') or [])
        candidates.extend(payload.get('items') or [])
    exact = []
    for candidate in candidates:
        if str(candidate.get('title') or '') != title:
            continue
        if seller and str(candidate.get('seller') or '') != seller:
            continue
        if source and str(candidate.get('source') or '').lower() != source:
            continue
        if posted and str(candidate.get('postedAt') or '') != posted:
            continue
        exact.append(candidate)
    if exact:
        return str(exact[0].get('id'))

    # The scanner and PWA are built in separate passes, so a post can have a
    # slightly different timestamp (or source label) by the time the alert is
    # evaluated. Match the published card by stable identity before falling
    # back to the source ID. The old fallback produced ?watch=reddit:...;
    # the PWA only knows listing-... IDs and consequently opened the home page.
    relaxed = [candidate for candidate in candidates
               if str(candidate.get('title') or '') == title
               and (not seller or str(candidate.get('seller') or '') == seller)]
    if source:
        same_source = [candidate for candidate in relaxed
                       if str(candidate.get('source') or '').lower() == source]
        if same_source:
            relaxed = same_source
    if relaxed:
        if posted:
            from datetime import datetime
            def distance(candidate):
                try:
                    left = datetime.fromisoformat(posted)
                    right = datetime.fromisoformat(str(candidate.get('postedAt') or ''))
                    return abs((left - right).total_seconds())
                except Exception:
                    return float('inf')
            relaxed.sort(key=distance)
        return str(relaxed[0].get('id'))
    return str(item.get('id') or '')


def push(title: str, body: str, tag: str, url: str = DAILY_DELTA_URL, category: str = ''):
    payload = json.dumps({'title': title, 'body': body, 'tag': tag, 'url': url, 'category': category}).encode()
    try:
        request = Request(PUSH_URL, data=payload, method='POST', headers={'Content-Type': 'application/json'})
        with urlopen(request, timeout=10) as response:
            result = json.loads(response.read().decode())
        return any(row.get('ok') for row in result.get('results', [])), result
    except Exception as exc:
        print(f'push unavailable: {type(exc).__name__}')
        return False, {'error': type(exc).__name__}


# A genuinely new source post may alert again after seven days. Already
# acknowledged raw IDs never replay, even when this crosspost window expires.
CROSSPOST_WINDOW = 7 * 24 * 60 * 60


def group_id(item):
    return hashlib.sha256(crosspost_key(item).encode()).hexdigest()[:24]


def migrate_groups(old, current, prior, now):
    groups = dict(old.get('notification_groups') or {})
    if old.get('notification_groups_version') == 1:
        return groups
    # Old raw-ID acknowledgements are the only available migration evidence.
    # firstSeenAt is stable; postedAt can be reconstructed on every scrape.
    for item in current:
        if str(item.get('id')) not in prior:
            continue
        try:
            seen = datetime.fromisoformat(str(item.get('firstSeenAt')).replace('Z', '+00:00')).timestamp()
            seen = min(seen, now)
        except (ValueError, TypeError):
            seen = now
        key = group_id(item)
        groups[key] = max(float(groups.get(key, 0)), seen)
    return groups


def main():
    payload = load(LATEST, {})
    current = payload.get('currentItems') or []
    daily = payload.get('items') or []
    old = load(STATE, None)
    current_ids = {str(item.get('id')) for item in current if item.get('id')}
    daily_ids = {str(item.get('id')) for item in daily if item.get('id')}
    if not isinstance(old, dict):
        save(STATE, {'current_ids': sorted(current_ids), 'daily_ids': sorted(daily_ids)})
        print(json.dumps({'seeded': True, 'current': len(current_ids), 'daily': len(daily_ids)}))
        return 0

    prior_current = set(old.get('current_ids') or [])
    prior_daily = set(old.get('daily_ids') or [])
    now = time.time()
    groups = migrate_groups(old, current, prior_current, now)
    new_current = [item for item in current if str(item.get('id')) not in prior_current]
    new_daily = [item for item in daily if str(item.get('id')) not in prior_daily]
    fx = rates()
    cheap = []
    for item in new_current:
        usd, currency, amount = usd_value(item, fx)
        if usd is not None and usd <= LIMIT_USD:
            cheap.append((item, usd, currency, amount))

    sent = []
    acknowledged_current = set(prior_current)
    acknowledged_daily = set(prior_daily)
    if new_daily:
        names = ', '.join(str(item.get('title') or 'Untitled')[:60] for item in new_daily[:3])
        suffix = f' +{len(new_daily)-3} more' if len(new_daily) > 3 else ''
        ok, result = push('Watch Desk daily delta', f'{len(new_daily)} new watch listing(s): {names}{suffix}', 'watch-daily-delta', category='daily_delta')
        if ok:
            sent.append('daily_delta')
            acknowledged_daily.update(str(item.get('id')) for item in new_daily if item.get('id'))
        else: print(result)
    else:
        acknowledged_daily.update(daily_ids)
    if cheap:
        cheap_sent = 0
        for item, usd, currency, amount in cheap:
            item_id = str(item.get('id') or '')
            if not item_id:
                continue
            key = group_id(item)
            if key in groups and now - groups[key] < CROSSPOST_WINDOW:
                acknowledged_current.add(item_id)
                continue
            title = str(item.get('title') or 'Untitled')[:80]
            detail_id = pwa_listing_id(item)
            detail_url = f'{DAILY_DELTA_URL}?watch={quote(detail_id, safe="")}'
            body = f'{title} · ${usd:,.0f} USD eq. ({currency} {amount:g})'
            ok, result = push('Watch under $400 USD', body, f'watch-under-400-{key}', detail_url, 'under_400')
            if ok:
                cheap_sent += 1
                acknowledged_current.add(item_id)
                groups[key] = now
            else:
                print(result)
        if cheap_sent:
            sent.append(f'low_price:{cheap_sent}')
        # New listings that are not cheap do not need to be retried. Each
        # cheap listing remains pending individually if its own push failed.
        acknowledged_current.update(str(item.get('id')) for item in new_current if item.get('id') and all(str(item.get('id')) != str(cheap_item.get('id')) for cheap_item, _, _, _ in cheap))
    else:
        acknowledged_current.update(str(item.get('id')) for item in new_current if item.get('id'))

    save(STATE, {**old, 'current_ids': sorted(acknowledged_current), 'daily_ids': sorted(acknowledged_daily),
                 'notification_groups_version': 1, 'notification_groups': groups})
    print(json.dumps({'new_current': len(new_current), 'new_daily': len(new_daily), 'cheap': len(cheap), 'sent': sent}))
    return 0


if __name__ == '__main__':
    STATE.parent.mkdir(parents=True, exist_ok=True)
    with STATE.with_suffix('.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        raise SystemExit(main())
