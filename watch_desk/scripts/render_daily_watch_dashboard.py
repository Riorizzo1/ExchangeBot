#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from html import escape
from datetime import datetime, timezone, timedelta
from urllib.parse import quote

ROOT = Path('/Users/bobby/.openclaw/workspace')
PUBLIC = ROOT / 'watch_desk' / 'public'
DATA_DIR = PUBLIC / 'data'
STATE_PATH = PUBLIC / 'data' / 'daily_watch_dashboard.json'
LATEST_PATH = PUBLIC / 'data' / 'latest.json'
OUT_HTML = PUBLIC / 'v2.html'
INDEX_HTML = PUBLIC / 'index.html'
ET = timezone(timedelta(hours=-4))
LOCAL_MEDIA_BASE = 'http://10.0.0.186:4314'


def normalize_media_url(src):
    if not src:
        return ''
    s = str(src).strip()
    if s.startswith('//'):
        return 'https:' + s
    if s.startswith('/images/'):
        return LOCAL_MEDIA_BASE + s
    return s


def display_media_url(src):
    s = normalize_media_url(src)
    if s.startswith('http://') or s.startswith('https://'):
        return '/proxy-image?u=' + quote(s, safe='')
    return s


def is_viewable_media_url(src):
    if not src:
        return False
    s = normalize_media_url(src)
    lower = s.lower().split('?', 1)[0].split('#', 1)[0]
    if 'clickpix.org/image/' in lower:
        return False
    if lower.startswith(LOCAL_MEDIA_BASE + '/images/'):
        return True
    if lower.endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif')):
        return True
    if (
        'preview.redd.it' in lower
        or 'external-preview.redd.it' in lower
        or 'i.redd.it' in lower
        or 'media.redd.it' in lower
        or 'images.clickpix.org/' in lower
    ):
        return True
    return False



def load_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except Exception:
        return default


def fmt_price(value):
    if value in (None, ''):
        return 'Price n/a'
    try:
        n = float(str(value).replace('$', '').replace(',', '').strip())
    except Exception:
        return str(value)
    return f'${int(n):,}' if n.is_integer() else f'${n:,.0f}'


def format_posted(value):
    if value in (None, ''):
        return 'n/a'
    s = str(value).strip()
    if not s:
        return 'n/a'
    m = re.match(r'^(.*[+-]\d{2})(\d{2})$', s)
    if m and ':' not in m.group(1)[-3:]:
        s = f'{m.group(1)}:{m.group(2)}'
    try:
        dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
        return dt.astimezone(ET).strftime('%a %m/%d, %-I:%M %p')
    except Exception:
        pass
    if re.match(r'^\d{1,2}:\d{2}\s?[AP]M$', s, re.I):
        return f"{datetime.now(ET).strftime('%a %m/%d')}, {s.upper().replace('  ', ' ')}"
    return s


def format_updated_at(value):
    if value in (None, ''):
        return 'n/a'
    s = str(value).strip()
    if not s:
        return 'n/a'
    try:
        dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
        return dt.astimezone(ET).strftime('%a %m/%d, %-I:%M %p ET')
    except Exception:
        return format_posted(value)


def lookup_map():
    payload = load_json(LATEST_PATH, {})
    items = payload.get('currentItems') or payload.get('items') or []
    by_url = {}
    by_id = {}
    for item in items:
        url = item.get('url')
        if url:
            by_url[url.rstrip('/')] = item
            by_url[url] = item
        iid = item.get('id')
        if iid:
            by_id[iid] = item
    images_by_url = {}
    for pattern in ('reddit-images-*.json', 'rwi-images-*.json'):
        for path in sorted((PUBLIC / 'data').glob(pattern)):
            obj = load_json(path, {})
            for row in obj.get('rows') or []:
                url = row.get('url')
                images = [normalize_media_url(img) for img in (row.get('images') or []) if is_viewable_media_url(img)]
                if not url or not images:
                    continue
                key = url.rstrip('/')
                images_by_url[key] = images
                images_by_url[url] = images
    return payload, by_url, by_id, images_by_url


def pick_media(row, by_url, by_id, images_by_url):
    candidates = [row.get('url'), row.get('groupKey'), row.get('threadUrl')]
    if row.get('source') == 'reddit':
        candidates.extend([row.get('url'), row.get('groupKey'), f"reddit:{row.get('id') or row.get('listing_id') or ''}"])
    else:
        candidates.extend([row.get('url'), row.get('threadId'), f"rwi:{row.get('id') or row.get('threadId') or ''}"])

    for candidate in candidates:
        if not candidate:
            continue
        key = str(candidate).rstrip('/')
        full_images = [normalize_media_url(img) for img in (images_by_url.get(key) or images_by_url.get(candidate) or []) if is_viewable_media_url(img)]
        item = by_url.get(key) or by_id.get(key)
        if item:
            thumb = normalize_media_url(item.get('thumb') or '')
            images = full_images or [normalize_media_url(img) for img in (item.get('images') or []) if is_viewable_media_url(img)]
            if full_images:
                thumb = full_images[0]
            elif not thumb and images:
                thumb = images[0]
            return thumb, images
        if full_images:
            return full_images[0], full_images
    return '', []


def pick_group_media(group, by_url, by_id, images_by_url):
    thumb = ''
    images = []
    seen = set()
    for row in group:
        row_thumb, row_images = pick_media(row, by_url, by_id, images_by_url)
        if not thumb and row_thumb:
            thumb = row_thumb
        for src in row_images or []:
            if src and src not in seen:
                seen.add(src)
                images.append(src)
    if not thumb and images:
        thumb = images[0]
    return normalize_media_url(thumb), [normalize_media_url(img) for img in images if is_viewable_media_url(img)]


def group_rows(rows, source):
    groups = defaultdict(list)
    for row in rows:
        key = row.get('groupKey') or row.get('id')
        groups[key].append(row)

    sorted_groups = sorted(
        groups.values(),
        key=lambda group: max((r.get('firstSeenAt') or r.get('lastSeenAt') or '') for r in group),
        reverse=True,
    )
    return sorted_groups


def render_bulk_list(group):
    out = []
    for row in group[:12]:
        title = row.get('title') or 'Untitled'
        price = fmt_price(row.get('price'))
        out.append(
            f'<div class="bulk-row"><div class="bulk-title">{escape(title)}</div>'
            f'<div class="bulk-price">{escape(price)}</div></div>'
        )
    extra = len(group) - 12
    if extra > 0:
        out.append(f'<div class="bulk-row"><div class="bulk-title muted">and {extra} more</div><div></div></div>')
    return ''.join(out)


def render_card(group, by_url, by_id, images_by_url):
    first = group[0]
    thumb, images = pick_group_media(group, by_url, by_id, images_by_url)
    bulk = len(group) > 1
    status = first.get('status') or 'unknown'
    source_label = first.get('sourceLabel') or ('Reddit' if first.get('source') == 'reddit' else 'RWI')
    title = first.get('title') or 'Untitled'
    price = fmt_price(first.get('price'))
    seller = first.get('seller') or 'Seller unknown'
    posted = format_posted(first.get('posted') or '')
    seen = format_posted(first.get('firstSeenAt') or first.get('lastSeenAt') or '')
    url = first.get('url') or '#'
    bulk_note = f'{len(group)} items in one post' if bulk else ''
    bulk_markup = f'<div class="bulk-note">{escape(bulk_note)}</div>' if bulk_note else ''
    bulk_list = render_bulk_list(group) if bulk else ''
    img_markup = (
        f'<img src="{escape(display_media_url(thumb))}" loading="lazy" decoding="async" '
        f'referrerpolicy="no-referrer" onerror="this.closest(\'.pic\').innerHTML=\'<div class=&quot;pic-none&quot;>No image</div>\';" />'
        if thumb else '<div class="pic-none">No image</div>'
    )
    photos_note = f'<span class="photos">{len(images)} photo{"s" if len(images) != 1 else ""}</span>' if images else ''
    post_type = first.get('postType') or ''
    is_price_drop = post_type == 'price_drop' or bool(first.get('wasPriceDrop'))
    post_type_badge = ''
    if post_type == 'price_drop':
        post_type_badge = '<span class="type-badge price-drop">Price Drop</span>'
    elif first.get('wasPriceDrop'):
        post_type_badge = '<span class="type-badge price-drop">Was Price Drop</span>'
    price_note = first.get('priceNote') or ''
    detail = {
        'title': title,
        'status': status,
        'sourceLabel': source_label,
        'price': price,
        'seller': seller,
        'posted': posted,
        'seen': seen,
        'url': url,
        'thumb': display_media_url(thumb),
        'images': [display_media_url(img) for img in images[:6]],
        'bulk': bulk,
        'bulkCount': len(group),
        'postType': post_type,
        'priceNote': price_note,
        'wasPriceDrop': bool(first.get('wasPriceDrop')),
        'items': [
            {
                'title': row.get('title') or 'Untitled',
                'price': fmt_price(row.get('price')),
                'url': row.get('url') or '',
                'posted': format_posted(row.get('posted') or ''),
            }
            for row in group
        ],
    }
    detail_attr = escape(json.dumps(detail, separators=(',', ':')), quote=True)
    return f'''
      <article class="card {escape(status)} {'bulk' if bulk else ''}" data-source="{escape(first.get('source') or 'reddit')}" data-status="{escape(status)}" data-post-type="{escape(post_type)}" data-price-drop="{'1' if is_price_drop else '0'}" data-posted-at="{escape(first.get('firstSeenAt') or first.get('lastSeenAt') or '')}" data-detail="{detail_attr}" role="button" tabindex="0">
        <div class="pic-wrap">
          <div class="pic">{img_markup}</div>
          <div class="badge {escape(status)}">{escape(status)}{(' · bulk' if bulk else '')}</div>
        </div>
        <div class="info">
          <div class="kicker">{escape(source_label)}{photos_note and f' · {photos_note}'} {post_type_badge}</div>
          <div class="title">{escape(title)}</div>
          <div class="price">{escape(price)}</div>
          <div class="meta">{escape(seller)}</div>
          <div class="meta muted">Posted {escape(posted or 'n/a')} · Seen {escape(seen or 'n/a')}{(' · ' + escape(price_note)) if price_note else ''}</div>
          {bulk_markup}
          {bulk_list}
          <a class="open" href="{escape(url)}" target="_blank" rel="noreferrer">Open source ↗</a>
        </div>
      </article>
    '''


def render_section(title, rows, by_url, by_id, images_by_url, section_id):
    if not rows:
        return f'<section class="section" id="{escape(section_id)}" data-tab="{escape(section_id)}"><h2>{escape(title)}</h2><div class="empty">No items yet today.</div></section>'

    groups = group_rows(rows, title)
    cards = ''.join(render_card(group, by_url, by_id, images_by_url) for group in groups)
    return f'<section class="section" id="{escape(section_id)}" data-tab="{escape(section_id)}"><h2>{escape(title)} <span>({len(rows)})</span></h2><div class="grid">{cards}</div></section>'



def render_card_pool(rows, by_url, by_id, images_by_url, source):
    hidden_attr = '' if source == 'all' else ' style="display:none"'
    if not rows:
        return f'<div class="card-pool" data-source="{escape(source)}"{hidden_attr}></div>'
    groups = group_rows(rows, source)
    cards = ''.join(render_card(group, by_url, by_id, images_by_url) for group in groups)
    return f'<div class="card-pool" data-source="{escape(source)}"{hidden_attr}>{cards}</div>'


def main():
    state = load_json(STATE_PATH, {})
    reddit_rows = state.get('reddit') or []
    rwi_rows = state.get('rwi') or []
    latest_payload, by_url, by_id, images_by_url = lookup_map()

    # Keep the live page bounded. Pulling every historical daily snapshot into the
    # HTML made the dashboard balloon to tens of MB and stall mobile browsers.
    all_items = list(latest_payload.get('currentItems') or latest_payload.get('items') or [])

    all_rows = []
    reddit_rows = []
    rwi_rows = []
    seen_ids = set()
    for item in all_items:
        item_id = item.get('id') or item.get('url') or ''
        if item_id in seen_ids:
            continue
        seen_ids.add(item_id)
        raw_status = str(item.get('status') or '').lower()
        display_status = 'available' if raw_status in ('for sale', 'available') else raw_status if raw_status in ('pending', 'sold') else 'available'
        normalized = {
            'id': item.get('id') or '',
            'groupKey': item.get('url') or item.get('id') or '',
            'source': 'rwi' if item.get('source') == 'RWI' else 'reddit',
            'sourceLabel': item.get('sourceLabel') or ('RWI' if item.get('source') == 'RWI' else item.get('source', '')),
            'status': display_status,
            'title': item.get('title') or 'Untitled',
            'price': item.get('price') or '',
            'seller': item.get('seller') or '',
            'posted': item.get('postedAt') or item.get('postedLabel') or '',
            'url': item.get('url') or '',
            'firstSeenAt': item.get('firstSeenAt') or item.get('postedAt') or '',
            'lastSeenAt': item.get('statusUpdatedAt') or item.get('lastSeenAt') or item.get('postedAt') or '',
            'postType': item.get('postType') or '',
            'label': item.get('label') or '',
            'priceNote': item.get('priceNote') or '',
            'wasPriceDrop': bool(item.get('wasPriceDrop')),
        }
        all_rows.append(normalized)
        if normalized['source'] == 'reddit':
            reddit_rows.append(normalized)
        else:
            rwi_rows.append(normalized)

    latest_preview = latest_payload.get('items') or []

    day = state.get('day') or datetime.now(ET).date().isoformat()
    updated_at = state.get('updatedAt') or latest_payload.get('generatedAt') or datetime.now(ET).isoformat()
    window = state.get('window') or {'startHour': 7, 'endHour': 23}

    reddit_count = len(reddit_rows)
    rwi_count = len(rwi_rows)
    total = len(all_rows)
    with_images = sum(1 for row in reddit_rows + rwi_rows if pick_media(row, by_url, by_id, images_by_url)[0])
    price_drop_total = sum(1 for row in all_rows if row.get('postType') == 'price_drop' or row.get('wasPriceDrop'))
    price_drop_active = sum(1 for row in all_rows if (row.get('postType') == 'price_drop' or row.get('wasPriceDrop')) and row.get('status') in ('available', 'pending'))
    rwi_live_rows = [row for row in rwi_rows if row.get('status') in ('available', 'pending')]

    preview_section = ''
    if total == 0 and latest_preview:
        preview_rows = []
        for item in latest_preview[:8]:
            preview_rows.append({
                'id': item.get('id') or item.get('url'),
                'groupKey': item.get('url') or item.get('id'),
                'source': 'preview',
                'sourceLabel': item.get('source') or 'Preview',
                'status': item.get('status') or 'available',
                'title': item.get('title') or 'Untitled',
                'price': item.get('price') or '',
                'seller': item.get('seller') or '',
                'posted': format_posted(item.get('postedAt') or item.get('postedLabel') or ''),
                'url': item.get('url') or '',
                'firstSeenAt': item.get('postedAt') or '',
                'lastSeenAt': item.get('postedAt') or '',
            })
        preview_section = render_section('Picture-led preview', preview_rows, by_url, by_id, images_by_url, 'preview')

    html = f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="120" />
  <title>Watch Desk Daily Delta</title>
  <style>
    :root {{ color-scheme: dark; }}
    * {{ box-sizing: border-box; }}
    body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif; background:#080a0d; color:#f3f5f7; }}
    main {{ max-width: 1120px; margin:0 auto; padding: 18px 12px 36px; }}
    .hero {{ background: rgba(8,10,13,.98); border-bottom:1px solid #2a323c; padding: 12px 0 14px; margin-bottom: 14px; }}
    h1 {{ margin:0 0 8px; font-size:20px; line-height:1.1; }}
    .subtle {{ color:#9aa5b1; }}
    .filter-bar {{ display:flex; flex-direction:column; gap:8px; margin-top:12px; }}
    .filter-row {{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }}
    .filter-group {{ display:flex; gap:6px; flex-wrap:wrap; }}
    .filter-label {{ color:#9aa5b1; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; align-self:center; margin-right:4px; }}
    .filter-btn {{ color:#f8fafc; background:#1b2230; border:1px solid #2a3a50; border-radius:6px; padding:7px 11px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; white-space:nowrap; }}
    .filter-btn.active {{ background:#253044; border-color:#566579; color:#f8fafc; }}
    .filter-btn:hover:not(.active) {{ border-color:#445566; }}
    select.filter-select {{ appearance:none; background:#1b2230; border:1px solid #2a3a50; border-radius:6px; color:#f8fafc; padding:7px 28px 7px 10px; font-size:12px; font-family:inherit; cursor:pointer; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath fill='%239aa5b1' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 8px center; }}
    input.search-input {{ background:#1b2230; border:1px solid #2a3a50; border-radius:6px; color:#f8fafc; padding:7px 10px; font-size:12px; font-family:inherit; width:180px; }}
    input.search-input::placeholder {{ color:#566579; }}
    #result-count {{ color:#9aa5b1; font-size:12px; margin-top:8px; }}
    .card.hidden {{ display: none; }}
    .card-pool {{ display:grid; grid-template-columns: repeat(auto-fill, minmax(320px,1fr)); gap:12px; margin-top:16px; }}
    .stats {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(150px,1fr)); gap:10px; margin-top:12px; }}
    .stat {{ background:#11151a; border:1px solid #2a323c; border-radius:12px; padding:12px; }}
    .stat b {{ display:block; font-size:22px; margin-top:6px; }}
    .section {{ margin-top: 18px; }}
    .section h2 {{ margin:0 0 10px; font-size:18px; }}
    .section h2 span {{ color:#9aa5b1; font-weight:500; }}
    .grid {{ display:grid; grid-template-columns: repeat(auto-fit, minmax(320px,1fr)); gap: 12px; }}
    .card {{ display:grid; grid-template-columns: 128px 1fr; min-height: 138px; background:#11151a; border:1px solid rgba(255,255,255,.06); border-radius: 8px; overflow:hidden; box-shadow: 0 6px 14px rgba(0,0,0,.14); }}
    .card.bulk {{ background:#121820; border-color:#435063; }}
    .pic-wrap {{ position: relative; background:#0b1016; }}
    .pic {{ width:100%; height:100%; min-height:138px; background:#0b1016; }}
    .pic img {{ width:100%; height:100%; object-fit: cover; display:block; }}
    .pic-none {{ width:100%; height:100%; min-height:138px; display:grid; place-items:center; color:#8d98a5; font-size:11px; padding:8px; background: linear-gradient(135deg,#0c1117,#111821); }}
    .badge {{ position:absolute; top:7px; left:7px; border-radius:3px; padding:3px 6px; font-size:8px; font-weight:850; text-transform:uppercase; letter-spacing:.07em; background:rgba(5,7,10,.78); color:#f6f7f9; border:1px solid rgba(255,255,255,.14); }}
    .available {{ background: rgba(34,197,94,.18); color:#baf7ce; border-color: rgba(34,197,94,.45); }}
    .pending {{ background: rgba(245,158,11,.18); color:#ffe2a0; border-color: rgba(245,158,11,.45); }}
    .sold {{ background: rgba(148,163,184,.18); color:#cbd5e1; border-color: rgba(148,163,184,.45); }}
    .unknown {{ background: rgba(148,163,184,.18); color:#f8fafc; border-color: rgba(203,213,225,.3); }}
    .info {{ padding: 10px 12px; min-width:0; }}
    .kicker {{ font-size:10px; font-weight:780; text-transform:uppercase; letter-spacing:.055em; color:#9aa7b5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:6px; }}
    .type-badge {{ display:inline-block; margin-left:6px; padding:1px 6px; border-radius:999px; font-size:9px; font-weight:800; letter-spacing:.02em; text-transform:none; vertical-align:1px; }}
    .type-badge.price-drop {{ background:#10253f; color:#7fc0ff; border:1px solid #28527d; }}
    .title {{ font-size:14.5px; font-weight:760; line-height:1.25; color:#f4f6f8; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere; }}
    .price {{ font-size:18px; font-weight:830; line-height:1; margin:8px 0 6px; color:#fff; font-variant-numeric:tabular-nums; }}
    .meta {{ font-size:12px; color:#aeb8c4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:4px; }}
    .meta.muted {{ color:#75818e; }}
    .photos {{ color:#75818e; font-weight:600; text-transform:none; letter-spacing:0; margin-left:4px; }}
    .bulk-note {{ margin-top:8px; color:#c8d0d8; font-size:12px; font-weight:700; }}
    .bulk-list {{ margin-top:10px; border-top:1px solid rgba(255,255,255,.08); }}
    .bulk-row {{ display:grid; grid-template-columns: 1fr auto; gap:10px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.06); }}
    .bulk-title {{ font-size:12px; line-height:1.3; color:#f6f7f9; }}
    .bulk-price {{ font-size:12px; font-weight:820; white-space:nowrap; color:#f6f7f9; font-variant-numeric:tabular-nums; }}
    .empty {{ padding:16px; border:1px dashed #22304d; border-radius:14px; color:#94a3b8; background:#0f1729; }}
    .open {{ display:inline-flex; margin-top:12px; background:#202834; color:#f8fafc; border:1px solid #566579; border-radius:4px; padding:10px 12px; text-decoration:none; font-weight:820; }}
    .modal {{ position:fixed; inset:0; background:rgba(0,0,0,.82); display:none; z-index:50; }}
    .modal.open {{ display:block; }}
    .sheet {{ position:absolute; left:50%; top:4vh; transform:translateX(-50%); width:min(900px, calc(100vw - 24px)); max-height:92vh; overflow:auto; background:#0b1016; border:1px solid #2a323c; border-radius:16px; padding:16px; box-shadow:0 30px 80px rgba(0,0,0,.45); }}
    .sheet-head {{ display:flex; justify-content:space-between; gap:12px; align-items:start; }}
    .sheet-close {{ appearance:none; border:1px solid #566579; background:#202834; color:#fff; border-radius:8px; width:38px; height:38px; font-size:22px; line-height:1; }}
    .sheet-grid {{ display:grid; grid-template-columns:1.2fr .8fr; gap:16px; margin-top:14px; }}
    .hero-img {{ width:100%; aspect-ratio: 4 / 3; object-fit: contain; background:#05070a; border:1px solid #2a323c; border-radius:12px; }}
    .thumbs {{ display:grid; grid-template-columns:repeat(auto-fill, minmax(88px,1fr)); gap:8px; margin-top:10px; }}
    .thumbs img {{ width:100%; height:88px; object-fit:cover; border-radius:8px; border:1px solid #2a323c; cursor:pointer; }}
    .thumbs img.on {{ border-color:#8ab4ff; box-shadow:0 0 0 2px rgba(138,180,255,.16); }}
    .detail-line {{ margin:6px 0; color:#aeb8c4; font-size:13px; }}
    .detail-line b {{ color:#f3f5f7; }}
    .detail-list {{ margin-top:10px; border-top:1px solid rgba(255,255,255,.08); }}
    .detail-row {{ display:grid; grid-template-columns:1fr auto; gap:10px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.06); }}
    .detail-row .left {{ font-size:13px; color:#f6f7f9; }}
    .detail-row .right {{ font-size:13px; color:#f6f7f9; white-space:nowrap; }}
    @media (max-width: 860px) {{ .sheet-grid {{ grid-template-columns:1fr; }} }}
    @media (max-width: 640px) {{ .card {{ grid-template-columns: 106px 1fr; }} .pic, .pic-none {{ min-height: 116px; }} }}
  </style>
</head>
<body>
  <main>
    <div class="hero">
      <h1>Watch Desk Daily Delta</h1>
      <div class="subtle">Hourly delta from 7am–11pm ET. Reddit and RWI accumulate together; bulk posts stay grouped like the Telegram output.</div>
      <div class="stats">
        <div class="stat"><span>Day</span><b>{escape(day)}</b></div>
        <div class="stat"><span>Window</span><b>{window.get('startHour',7)}:00–{window.get('endHour',23)}:00</b></div>
        <div class="stat"><span>Total items</span><b>{total}</b></div>
        <div class="stat"><span>With images</span><b>{with_images}</b></div>
        <div class="stat"><span>Reddit</span><b>{reddit_count}</b></div>
        <div class="stat"><span>RWI</span><b>{rwi_count}</b></div>
        <div class="stat"><span>Price drops</span><b>{price_drop_active} active / {price_drop_total} total</b></div>
      </div>
      <div class="subtle" style="margin-top: 10px;">Updated {escape(format_updated_at(updated_at))}</div>
      <div class="filter-bar">
        <div class="filter-row">
          <span class="filter-label">Source</span>
          <div class="filter-group">
            <button class="filter-btn active" data-filter="source" data-value="all">All</button>
            <button class="filter-btn" data-filter="source" data-value="reddit">Reddit</button>
            <button class="filter-btn" data-filter="source" data-value="rwi">RWI</button>
          </div>
        </div>
        <div class="filter-row">
          <span class="filter-label">Status</span>
          <div class="filter-group">
            <button class="filter-btn active" data-filter="status" data-value="active">Active</button>
            <button class="filter-btn" data-filter="status" data-value="available">For Sale</button>
            <button class="filter-btn" data-filter="status" data-value="pending">Pending</button>
            <button class="filter-btn" data-filter="status" data-value="sold">Sold</button>
            <button class="filter-btn" data-filter="status" data-value="all">Any</button>
          </div>
        </div>
        <div class="filter-row">
          <span class="filter-label">Type</span>
          <div class="filter-group">
            <button class="filter-btn active" data-filter="type" data-value="all">Any</button>
            <button class="filter-btn" data-filter="type" data-value="priceDrop">Price Drops</button>
          </div>
        </div>
        <div class="filter-row">
          <span class="filter-label">Sort</span>
          <select class="filter-select" id="sortSelect">
            <option value="newest">Newest</option>
            <option value="priceLow">Price ↑</option>
            <option value="priceHigh">Price ↓</option>
          </select>
          <div class="filter-group range-group">
            <button class="filter-btn active" id="rangeToday" data-range="today">Today</button>
            <button class="filter-btn" id="rangeAll" data-range="all">All current</button>
          </div>
          <input class="search-input" id="searchInput" type="search" placeholder="Search title, seller…">
          <span id="result-count"></span>
        </div>
      </div>
    </div>

    {render_card_pool(all_rows, by_url, by_id, images_by_url, 'all')}
  </main>
  <div class="modal" id="detailModal" aria-hidden="true">
    <div class="sheet">
      <div class="sheet-head">
        <div>
          <div class="subtle">Local detail view</div>
          <h2 id="modalTitle" style="margin:4px 0 0;font-size:22px;line-height:1.15;">Item details</h2>
        </div>
        <button class="sheet-close" id="modalClose" aria-label="Close">×</button>
      </div>
      <div class="sheet-grid">
        <div>
          <img id="modalHero" class="hero-img" alt="" />
          <div class="thumbs" id="modalThumbs"></div>
        </div>
        <div>
          <div class="detail-line"><b>Source:</b> <span id="modalSource"></span></div>
          <div class="detail-line"><b>Status:</b> <span id="modalStatus"></span></div>
          <div class="detail-line"><b>Price:</b> <span id="modalPrice"></span></div>
          <div class="detail-line"><b>Seller:</b> <span id="modalSeller"></span></div>
          <div class="detail-line"><b>Posted:</b> <span id="modalPosted"></span></div>
          <div class="detail-line"><b>Seen:</b> <span id="modalSeen"></span></div>
          <div class="detail-line"><b>Link:</b> <a id="modalLink" href="#" target="_blank" rel="noreferrer">Open source ↗</a></div>
          <div id="modalBulk" class="detail-list"></div>
        </div>
      </div>
    </div>
  </div>
  <script>
    const modal = document.getElementById('detailModal');
    const hero = document.getElementById('modalHero');
    const thumbs = document.getElementById('modalThumbs');
    const closeBtn = document.getElementById('modalClose');
    const titleEl = document.getElementById('modalTitle');
    const sourceEl = document.getElementById('modalSource');
    const statusEl = document.getElementById('modalStatus');
    const priceEl = document.getElementById('modalPrice');
    const sellerEl = document.getElementById('modalSeller');
    const postedEl = document.getElementById('modalPosted');
    const seenEl = document.getElementById('modalSeen');
    const linkEl = document.getElementById('modalLink');
    const bulkEl = document.getElementById('modalBulk');

    function openDetail(data) {{
      titleEl.textContent = data.title || 'Item details';
      sourceEl.textContent = data.sourceLabel || '';
      statusEl.textContent = data.status || '';
      priceEl.textContent = data.price || 'Price n/a';
      sellerEl.textContent = data.seller || 'Seller unknown';
      postedEl.textContent = data.posted || 'n/a';
      seenEl.textContent = data.seen || 'n/a';
      linkEl.href = data.url || '#';

      const images = Array.isArray(data.images) ? data.images.filter(Boolean) : [];
      const heroSrc = data.thumb || images[0] || '';
      hero.src = heroSrc;
      hero.alt = data.title || 'Preview image';
      hero.style.display = heroSrc ? 'block' : 'none';

      thumbs.innerHTML = images.map((src, idx) => `<img src="${{src}}" data-src="${{src}}" class="${{idx === 0 ? 'on' : ''}}" alt="">`).join('');
      thumbs.querySelectorAll('img').forEach((img) => {{
        img.addEventListener('click', () => {{
          hero.src = img.dataset.src;
          thumbs.querySelectorAll('img').forEach((x) => x.classList.remove('on'));
          img.classList.add('on');
        }});
      }});

      if (Array.isArray(data.items) && data.items.length) {{
        bulkEl.innerHTML = '<div class="subtle" style="font-weight:800;margin-bottom:8px;">Grouped rows</div>' + data.items.map((row) => `
          <div class="detail-row"><div class="left">${{row.title || 'Untitled'}}</div><div class="right">${{row.price || ''}}</div></div>
        `).join('');
      }} else {{
        bulkEl.innerHTML = '';
      }}

      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }}

    function closeDetail() {{
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }}

    document.querySelectorAll('[data-detail]').forEach((card) => {{
      const handler = (e) => {{
        const link = e.target.closest('a');
        if (link) return;
        try {{
          openDetail(JSON.parse(card.dataset.detail));
        }} catch (err) {{
          console.error(err);
        }}
      }};
      card.addEventListener('click', handler);
      card.addEventListener('keydown', (e) => {{
        if (e.key === 'Enter' || e.key === ' ') {{
          e.preventDefault();
          handler(e);
        }}
      }});
    }});

    closeBtn.addEventListener('click', closeDetail);
    modal.addEventListener('click', (e) => {{ if (e.target === modal) closeDetail(); }});
    document.addEventListener('keydown', (e) => {{ if (e.key === 'Escape') closeDetail(); }});

    // ── Filter & Sort Engine ───────────────────────────────────────────────
    let filterSource = 'all';
    let filterStatus = 'active';
    let filterType = 'all';
    let filterSort = 'newest';
    let filterQ = '';

    const ACTIVE_STATUSES = new Set(['available', 'pending']);

    function money(v) {{
      if (!v || v === 'Price n/a') return null;
      const m = String(v).replace(/[$,]/g, '').match(/[0-9]+(?:\.[0-9]+)?/);
      return m ? parseFloat(m[0]) : null;
    }}

    function cardVisible(card) {{
      const src = card.dataset.source || '';
      const status = card.dataset.status || '';
      const isPriceDrop = card.dataset.priceDrop === '1';
      if (filterSource !== 'all' && src !== filterSource) return false;
      if (filterStatus === 'active') {{
        if (!ACTIVE_STATUSES.has(status)) return false;
      }} else if (filterStatus !== 'all') {{
        if (status !== filterStatus) return false;
      }}
      if (filterType === 'priceDrop' && !isPriceDrop) return false;
      if (filterQ) {{
        const detail = (() => {{ try {{ return JSON.parse(card.dataset.detail); }} catch {{ return {{}}; }} }})();
        const haystack = ((detail.title || '') + ' ' + (detail.seller || '') + ' ' + (detail.sourceLabel || '') + ' ' + (detail.price || '') + ' ' + (detail.postType || '') + ' ' + (detail.priceNote || '')).toLowerCase();
        if (!haystack.includes(filterQ.toLowerCase())) return false;
      }}
      return true;
    }}

    function applyFilters() {{
      const range = window.currentRange || 'today';
      const todayDate = window.todayDate || '';
      const pools = document.querySelectorAll('.card-pool');
      let totalVisible = 0;
      const activePool = 'all';
      pools.forEach(pool => {{
        const src = pool.dataset.source || '';
        if (src !== activePool) {{ pool.style.display = 'none'; return; }}
        pool.style.display = '';
        let poolVisible = 0;
        pool.querySelectorAll('.card').forEach(card => {{
          if (range === 'today') {{
            const postedAt = card.dataset.postedAt || '';
            if (!postedAt.startsWith(todayDate)) {{ card.classList.add('hidden'); return; }}
          }}
          const show = cardVisible(card);
          card.classList.toggle('hidden', !show);
          if (show) poolVisible++;
        }});
        totalVisible += poolVisible;
      }});
      document.getElementById('result-count').textContent = totalVisible + ' item' + (totalVisible !== 1 ? 's' : '') + ' shown';
    }}

    function applySort() {{
      if (filterSort === 'newest') return;
      document.querySelectorAll('.card-pool').forEach(pool => {{
        const cards = Array.from(pool.querySelectorAll('.card:not(.hidden)'));
        cards.sort((a, b) => {{
          if (filterSort === 'priceLow') return (money(JSON.parse(a.dataset.detail).price) ?? Infinity) - (money(JSON.parse(b.dataset.detail).price) ?? Infinity);
          if (filterSort === 'priceHigh') return (money(JSON.parse(b.dataset.detail).price) ?? -1) - (money(JSON.parse(a.dataset.detail).price) ?? -1);
          return 0;
        }});
        cards.forEach(c => pool.appendChild(c));
      }});
    }}

    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {{
      btn.addEventListener('click', () => {{
        const g = btn.dataset.filter;
        document.querySelectorAll(`.filter-btn[data-filter="${{g}}"]`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (g === 'source') filterSource = btn.dataset.value;
        if (g === 'status') filterStatus = btn.dataset.value;
        if (g === 'type') filterType = btn.dataset.value;
        if (g === 'type') filterType = btn.dataset.value;
        applyFilters(); applySort();
      }});
    }});

    document.getElementById('sortSelect').addEventListener('change', e => {{ filterSort = e.target.value; applySort(); }});
    document.getElementById('searchInput').addEventListener('input', e => {{ filterQ = e.target.value.trim(); applyFilters(); applySort(); }});

    // Range toggle: today vs all-current
    window.currentRange = 'today';
    window.todayDate = {json.dumps(day)};
    document.querySelectorAll('[data-range]').forEach(btn => {{
      btn.addEventListener('click', () => {{
        window.currentRange = btn.dataset.range;
        document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
      }});
    }});

    applyFilters();
  </script>
</body>
</html>'''

    OUT_HTML.write_text(html)
    INDEX_HTML.write_text(html)
    print(json.dumps({
        'ok': True,
        'htmlPath': str(OUT_HTML),
        'indexPath': str(INDEX_HTML),
        'redditCount': reddit_count,
        'rwiCount': rwi_count,
        'total': total,
        'priceDropTotal': price_drop_total,
        'priceDropActive': price_drop_active,
        'priceDropTotal': price_drop_total,
        'priceDropActive': price_drop_active,
    }, indent=2))


if __name__ == '__main__':
    main()
