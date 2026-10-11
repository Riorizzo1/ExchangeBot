#!/usr/bin/env python3
import hashlib
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
SNAPSHOT = DATA / 'aggregate_snapshot.json'

ET = timezone(timedelta(hours=-4))
RECENT_WINDOW_HOURS = 3
TRACKED_SUBS = [
    'BSTRepWatch',
    'repwatchbuysell',
    'repwatchbuyselltrade',
    'watchexchangeBST',
    'TheRepTimeBST',
    'watchconnect',
]
PRICE_RE = re.compile(r'\$\s*([0-9,]+(?:\.[0-9]{1,2})?)')
LEADING_BULLET_RE = re.compile(r'^[•\-\+\*►▸·]\s*')
LEADING_LABEL_RE = re.compile(r'^(?:item\s*\d+[:\-]\s*|\d+[\.)-]\s*)', re.I)
SKIP_LINE_RE = re.compile(r'\b(?:shipping|ship|shipped|paypal|venmo|zelle|cashapp|wire|insured|insurance|fedex|ups|usps|priority|overnight|tracking|timestamp|album|imgur|photos?|video|qc|condition|payment|located|location|accept|trade only|trades only|sold separately)\b', re.I)
PRICE_BAD_CONTEXT_RE = re.compile(r'\b(?:shipping|ship|shipped|plus shipping|add shipping|net to me|fees?|ff|g&s|goods and services|paypal fee|deposit|tax)\b', re.I)
PRICE_GOOD_CONTEXT_RE = re.compile(r'\b(?:price|asking|asking price|take|for|selling|sale|fs|wts|priced at|my price|want to sell)\b', re.I)
WATCH_HINT_RE = re.compile(r'rolex|omega|cartier|tudor|iwc|patek|panerai|breitling|audemars|ap\b|nautilus|royal oak|sub|submariner|gmt|daytona|datejust|day[- ]?date|explorer|yacht[- ]?master|seamaster|speedmaster|santos|tank|dj\b|dd\b|vsf|clean|zf\b|arf|3kf|ppf|bbf|apsf|bpf|krf|v7f|ewf|gmf|qf|cf\b|af\b|tf\b|jf\b', re.I)
SOLD_RE = re.compile(r'\b(?:sold|traded|completed|gone)\b', re.I)
PENDING_RE = re.compile(r'\b(?:pending|hold)\b', re.I)
ACCESSORY_HINT_RE = re.compile(r'box|watch roll|roll only|strap\b|bracelet\b|extra bracelet|links|link\b|dial\b|hands\b|insert\b|bezel\b|clasp\b|springbar|spring bar|tool\b|caseback\b|goyard|pouch\b|travel case|presentation box|card holder', re.I)
WATCH_MODEL_HINT_RE = re.compile(r'jaeger|jlc|polaris|santos|tank|nautilus|daytona|submariner|datejust|day[- ]?date|explorer|yacht[- ]?master|seamaster|speedmaster|overseas|royal oak|pelagos|reverso|portugieser|panthere|hydroconquest|aquaracer|planet ocean|superocean|cartier|omega|rolex|iwc|tudor|patek|panerai|breitling|audemars|longines|tag heuer', re.I)


def latest_any(patterns):
    matches = []
    for pattern in patterns:
        matches.extend(CAPTURES.glob(pattern))
    matches = sorted(matches)
    return matches[-1] if matches else None


def latest_valid_direct(subreddit):
    matches = sorted(CAPTURES.glob(f'{subreddit}_direct_*.json'), reverse=True)
    for path in matches:
        try:
            obj = json.loads(path.read_text())
            body = obj.get('body')
            if not body:
                continue
            raw = json.loads(body)
            if isinstance(raw, dict) and raw.get('data', {}).get('children') is not None:
                return path
        except Exception:
            continue
    return None


def choose_capture(subreddit):
    if subreddit == 'BSTRepWatch':
        blob = ROOT / 'data' / 'current_from_blob.json'
        if blob.exists():
            return ('blob', blob)
    direct_path = latest_valid_direct(subreddit)
    bookmarklet_path = latest_any([f'{subreddit}_*.json'])
    if direct_path:
        return ('direct', direct_path)
    if bookmarklet_path:
        return ('bookmarklet', bookmarklet_path)
    return (None, None)


def detect_status(flair, text):
    f = (flair or '').upper()
    t = (text or '').upper()
    if any(x in f for x in ['SOLD', 'COMPLETE', 'CLOSED', 'TRADED']) or '[SOLD]' in t or '~~SOLD~~' in t or SOLD_RE.search(text or ''):
        return 'sold'
    if 'PENDING' in f or '[PENDING]' in t or PENDING_RE.search(text or ''):
        return 'pending'
    if any(x in t for x in ['[WTS]', 'WTS', 'FOR SALE', 'WANT TO SELL', '[FS]', ' FS ', ' SALE ']):
        return 'available'
    return 'unknown'


def parse_prices(text):
    vals = []
    for m in PRICE_RE.findall(text or ''):
        cleaned = (m or '').replace(',', '').strip()
        if not cleaned:
            continue
        try:
            n = float(cleaned)
        except ValueError:
            continue
        if 10 < n < 100000 and n not in vals:
            vals.append(n)
    return vals


def pick_best_price(post):
    title = post.get('title') or ''
    body = post.get('body') or ''
    lines = [normalize_line(x) for x in re.split(r'[\n\r]+', body)]

    scored = []

    def add_candidates(source_text, base_score):
        for price in parse_prices(source_text):
            score = base_score
            if PRICE_GOOD_CONTEXT_RE.search(source_text):
                score += 3
            if WATCH_HINT_RE.search(source_text):
                score += 2
            if ACCESSORY_HINT_RE.search(source_text):
                score -= 1
            if PRICE_BAD_CONTEXT_RE.search(source_text):
                score -= 5
            scored.append((score, price, source_text))

    add_candidates(title, 6)
    for line in lines:
        if not PRICE_RE.search(line):
            continue
        base = 4
        if SKIP_LINE_RE.search(line):
            base -= 4
        add_candidates(line, base)

    if not scored:
        combined = f'{title}\n{body}'
        add_candidates(combined, 1)

    if not scored:
        return None

    scored.sort(key=lambda x: (-x[0], x[1]))
    return scored[0][1]


def normalize_line(line):
    clean = ' '.join((line or '').split())
    clean = LEADING_BULLET_RE.sub('', clean)
    clean = LEADING_LABEL_RE.sub('', clean)
    return clean.strip(' -–|')


def canonical_title(text):
    t = normalize_line(text)
    t = re.sub(r'^\[WTS\](?:\s*\[[A-Z/]+\])?\s*', '', t, flags=re.I)
    t = re.sub(r'^\((?:USA|US|CONUS|WW|UK|EU|CAN)\)\s*', '', t, flags=re.I)
    t = re.sub(r'\$\s*[0-9,]+(?:\.[0-9]{1,2})?', '', t)
    t = re.sub(r'✅', ' ', t)
    t = re.sub(r'\b(?:shipped|shipping included|plus shipping|add shipping|price\s*\+\s*shipping(?: only today)?|shipping only today|obo|firm|brand new|seller code\s*:?\s*\d+)\b', '', t, flags=re.I)
    t = re.sub(r'\b(?:paypal ff|paypal g&s|fees extra|net to me)\b', '', t, flags=re.I)
    t = re.sub(r'\s*[-–,/]?\s*price\s*\+\s*shipping(?: only today)?', '', t, flags=re.I)
    t = re.sub(r'\s*[-–,/]?\s*\+\s*shipping(?: only today)?', '', t, flags=re.I)
    t = t.replace('!=', '')
    t = re.sub(r'^[\-–]+', '', t)
    return ' '.join(t.split()).strip(' -–,.:')


def listing_id(subreddit, url, title):
    raw = f'{subreddit}|{url}|{title.lower().strip()}'
    return hashlib.sha1(raw.encode()).hexdigest()[:16]


def load_blob_posts(path):
    obj = json.loads(path.read_text())
    grouped = {}
    for row in obj.get('rows', []):
        posted = row.get('posted') or ''
        if not any(x in posted for x in ['m ago', 'h ago']):
            continue
        url = row.get('url')
        if not url:
            continue
        bucket = grouped.setdefault(url, {
            'subreddit': 'BSTRepWatch',
            'post_id': url,
            'url': url,
            'author': row.get('seller'),
            'created_at': posted,
            'title': row.get('title') or row.get('summary') or '',
            'body': '',
            'flair': row.get('status') or '',
            'status': (row.get('status') or '').lower().replace('for sale', 'available'),
            'prices': [],
            'images': [],
            'source': str(path),
            'source_kind': 'blob',
            'blob_rows': [],
        })
        bucket['prices'].extend(row.get('prices') or [])
        for img in row.get('images') or []:
            if img not in bucket['images']:
                bucket['images'].append(img)
        bucket['blob_rows'].append({
            'title': row.get('title') or row.get('summary') or '',
            'price': min(row.get('prices') or [None]) if row.get('prices') else None,
        })
    return list(grouped.values())


def load_bookmarklet_posts(path, subreddit):
    obj = json.loads(path.read_text())
    posts = []
    for row in obj.get('rows', []):
        created = datetime.fromtimestamp(row.get('created', 0), tz=timezone.utc).astimezone(ET)
        posts.append({
            'subreddit': subreddit,
            'post_id': row.get('url'),
            'url': row.get('url'),
            'author': row.get('author'),
            'created_at': created.isoformat(),
            'title': row.get('title') or '',
            'body': row.get('body') or '',
            'flair': row.get('status') or '',
            'status': row.get('status') or 'unknown',
            'prices': [row.get('minPrice')] if row.get('minPrice') is not None else [],
            'source': str(path),
            'source_kind': 'bookmarklet',
        })
    return posts


def load_direct_posts(path, subreddit):
    obj = json.loads(path.read_text())
    raw = json.loads(obj.get('body', '{}'))
    posts = []
    for child in raw.get('data', {}).get('children', []):
        p = child.get('data', {})
        if not p or p.get('stickied'):
            continue
        title = p.get('title') or ''
        body = p.get('selftext') or ''
        flair = ' '.join(filter(None, [p.get('link_flair_text'), p.get('link_flair_css_class')]))
        post_url = 'https://www.reddit.com' + (p.get('permalink') or '')
        created = datetime.fromtimestamp(p.get('created_utc') or 0, tz=timezone.utc).astimezone(ET)

        parent = None
        parent_list = p.get('crosspost_parent_list') or []
        if parent_list:
            parent = parent_list[0]
            if isinstance(parent, dict) and 'data' in parent and isinstance(parent['data'], dict):
                parent = parent['data']
            if not isinstance(parent, dict):
                parent = None

        parent_url = ''
        if parent:
            parent_url = 'https://www.reddit.com' + (parent.get('permalink') or '') if parent.get('permalink') else (parent.get('url') or '')

        posts.append({
            'subreddit': subreddit,
            'post_id': p.get('id') or post_url,
            'url': post_url,
            'author': p.get('author'),
            'created_at': created.isoformat(),
            'title': title,
            'body': body,
            'flair': flair,
            'status': detect_status(flair, title + '\n' + body),
            'prices': parse_prices(title + '\n' + body),
            'source': str(path),
            'source_kind': 'direct',
            'crosspost_parent_id': p.get('crosspost_parent') or '',
            'crosspost_parent_url': parent_url,
            'crosspost_parent': parent,
        })
    return posts


def load_posts_for_subreddit(subreddit):
    kind, path = choose_capture(subreddit)
    if not path:
        return []
    if kind == 'blob':
        return load_blob_posts(path)
    if kind == 'bookmarklet':
        return load_bookmarklet_posts(path, subreddit)
    return load_direct_posts(path, subreddit)


def is_placeholder_text(value):
    text = normalize_line(value or '').strip().upper()
    return text in {'', 'NA', 'N/A', 'NONE', 'NULL', '[REMOVED]', '[DELETED]'}


def is_accessory(title, price):
    title = title or ''
    if WATCH_MODEL_HINT_RE.search(title):
        return False
    if ACCESSORY_HINT_RE.search(title) and not WATCH_HINT_RE.search(title):
        return True
    return False


def decompose_post(post):
    title = post['title']
    body = post['body'] or ''

    parent = post.get('crosspost_parent') if isinstance(post.get('crosspost_parent'), dict) else None
    if parent:
        parent_title = parent.get('title') or ''
        parent_body = parent.get('selftext') or ''
        if not is_placeholder_text(parent_title):
            title = parent_title
        if not is_placeholder_text(parent_body):
            body = parent_body
        parent_flair = ' '.join(filter(None, [parent.get('link_flair_text'), parent.get('link_flair_css_class')]))
        parent_status = detect_status(parent_flair, f'{title}\n{body}')
        if parent_status != 'unknown':
            post = {**post, 'status': parent_status}
        if parent.get('author'):
            post = {**post, 'author': parent.get('author')}
        parent_url = parent.get('url') or post.get('crosspost_parent_url') or ''
        if parent.get('permalink'):
            parent_url = 'https://www.reddit.com' + parent['permalink']
        post = {**post, 'crosspost_parent_url': parent_url, 'crosspost_parent_title': parent_title, 'crosspost_parent_body': parent_body}

    if post.get('crosspost_parent_id') or post.get('crosspost_parent_url'):
        if is_placeholder_text(title) and is_placeholder_text(body):
            clean = canonical_title(post.get('source_post_title') or post.get('title') or 'crosspost')
            return [{
                'listing_id': listing_id(post['subreddit'], post['url'], f'repost:{clean}'),
                'subreddit': post['subreddit'],
                'post_url': post['url'],
                'post_id': post['post_id'],
                'source_post_title': post.get('source_post_title') or post.get('title') or '',
                'title': f'[repost] {clean}',
                'status': 'repost',
                'price': None,
                'kind': 'repost',
                'posted': post['created_at'],
                'seller': post.get('author'),
                'source': post['source'],
                'bulk': False,
                'collapsed': True,
                'images': post.get('images') or [],
                'crosspost_parent_url': post.get('crosspost_parent_url') or '',
                'crosspost_parent_title': post.get('crosspost_parent_title') or '',
            }]

    if post.get('source_kind') == 'blob' and post.get('blob_rows'):
        listings = []
        for item in post.get('blob_rows', []):
            clean = canonical_title(item.get('title') or '')
            price = item.get('price')
            listings.append({
                'listing_id': listing_id(post['subreddit'], post['url'], clean),
                'subreddit': post['subreddit'],
                'post_url': post['url'],
                'post_id': post['post_id'],
                'source_post_title': post['title'],
                'title': clean,
                'status': post['status'],
                'price': price,
                'kind': 'accessory' if is_accessory(clean, price) else 'watch',
                'posted': post['created_at'],
                'seller': post['author'],
                'source': post['source'],
                'bulk': len(post.get('blob_rows', [])) >= 2,
                'images': post.get('images') or [],
            })
        return listings

    lines = [normalize_line(x) for x in re.split(r'[\n\r]+', body)]
    candidate_lines = []
    for line in lines:
        if len(line) < 8 or len(line) > 220:
            continue
        if not PRICE_RE.search(line):
            continue
        if SKIP_LINE_RE.search(line):
            continue
        if not (WATCH_HINT_RE.search(line) or ACCESSORY_HINT_RE.search(line)):
            continue
        candidate_lines.append(line)

    listings = []
    if len(candidate_lines) >= 2:
        for line in candidate_lines:
            prices = parse_prices(line)
            price = min(prices) if prices else None
            clean = canonical_title(line)
            listings.append({
                'listing_id': listing_id(post['subreddit'], post['url'], clean),
                'subreddit': post['subreddit'],
                'post_url': post['url'],
                'post_id': post['post_id'],
                'source_post_title': title,
                'title': clean,
                'status': post['status'],
                'price': price,
                'kind': 'accessory' if is_accessory(clean, price) else 'watch',
                'posted': post['created_at'],
                'seller': post['author'],
                'source': post['source'],
                'bulk': True,
                'images': post.get('images') or [],
            })
    else:
        price = post['prices'][0] if post.get('prices') else pick_best_price(post)
        clean = canonical_title(title)
        listings.append({
            'listing_id': listing_id(post['subreddit'], post['url'], clean),
            'subreddit': post['subreddit'],
            'post_url': post['url'],
            'post_id': post['post_id'],
            'source_post_title': title,
            'title': clean,
            'status': post['status'],
            'price': price,
            'kind': 'accessory' if is_accessory(clean, price) else 'watch',
            'posted': post['created_at'],
            'seller': post['author'],
            'source': post['source'],
            'bulk': False,
            'images': post.get('images') or [],
        })
    return listings


def canonicalize(posts):
    listings = []
    seen = set()
    for post in posts:
        for listing in decompose_post(post):
            key = listing['listing_id']
            if key in seen:
                continue
            seen.add(key)
            listings.append(listing)
    listings.sort(key=lambda r: (r['posted'] or '', r['subreddit'], r['title']), reverse=True)
    return listings


def load_previous():
    if not PREVIOUS.exists():
        return []
    return json.loads(PREVIOUS.read_text())


def parse_posted(value):
    if not value:
        return None
    if isinstance(value, str) and ('m ago' in value or 'h ago' in value):
        return datetime.now(ET)
    try:
        return datetime.fromisoformat(value)
    except Exception:
        return None


def row_key(r):
    return r.get('listing_id') or listing_id(r.get('subreddit'), r.get('post_url') or r.get('url'), r.get('title'))


def main():
    posts = []
    for subreddit in TRACKED_SUBS:
        posts.extend(load_posts_for_subreddit(subreddit))

    current = canonicalize(posts)
    previous = load_previous()
    prev_keys = {row_key(r) for r in previous}
    delta = [r for r in current if row_key(r) not in prev_keys]

    cutoff = datetime.now(ET) - timedelta(hours=RECENT_WINDOW_HOURS)
    recent_delta = [r for r in delta if (parse_posted(r.get('posted')) and parse_posted(r.get('posted')) >= cutoff)]

    recent_fallback = []
    if not recent_delta:
        for r in current:
            posted = parse_posted(r.get('posted'))
            if not posted or posted < cutoff:
                continue
            if (r.get('status') or '').lower() not in ('available', 'pending'):
                continue
            recent_fallback.append(r)

    snapshot = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'recent_window_hours': RECENT_WINDOW_HOURS,
        'tracked_subreddits': TRACKED_SUBS,
        'current': current,
        'previous': previous,
        'delta': delta,
        'recent_delta': recent_delta,
        'recent_fallback': recent_fallback,
    }

    CURRENT.write_text(json.dumps(current, indent=2))
    DELTA.write_text(json.dumps(delta, indent=2))
    PREVIOUS.write_text(json.dumps(current, indent=2))
    SNAPSHOT.write_text(json.dumps(snapshot, indent=2))

    counts = {}
    for r in current:
        counts[r['subreddit']] = counts.get(r['subreddit'], 0) + 1

    print(json.dumps({
        'current_count': len(current),
        'delta_count': len(delta),
        'recent_delta_count': len(recent_delta),
        'recent_fallback_count': len(recent_fallback),
        'by_subreddit': counts,
        'snapshot_out': str(SNAPSHOT),
    }, indent=2))


if __name__ == '__main__':
    main()
