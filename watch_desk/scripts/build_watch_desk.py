#!/usr/bin/env python3
from __future__ import annotations
import sys, os
import json, re, html, hashlib, shutil
from pathlib import Path
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen
from urllib.parse import urlparse
from PIL import Image, ImageOps
from io import BytesIO

ROOT=Path('/Users/bobby/.openclaw/workspace')
APP=ROOT/'watch_desk'
PUBLIC=APP/'public'
DATA_DIR=PUBLIC/'data'
FULL_DIR=PUBLIC/'images'/'full'
THUMB_DIR=PUBLIC/'images'/'thumbs'
ET=timezone(timedelta(hours=-4))
TODAY=datetime.now(ET).date().isoformat()
NOW=datetime.now(ET)
for d in (DATA_DIR,FULL_DIR,THUMB_DIR): d.mkdir(parents=True, exist_ok=True)

WATCH_HINT=re.compile(r'rolex|omega|cartier|tudor|iwc|patek|panerai|breitling|audemars|\bap\b|nautilus|royal oak|submariner|gmt|daytona|datejust|day[- ]?date|explorer|yacht[- ]?master|seamaster|speedmaster|santos|tank|vsf|clean|zf\b|arf|noob|v7f|3kf|qf|bp\b|bbf|pam\b|rm0?55|richard mille|land dweller', re.I)
SOLD_RE=re.compile(r'\b(sold|complete|completed|closed|traded|removed|deleted|unavailable)\b', re.I)
PENDING_RE=re.compile(r'\b(pending|hold)\b', re.I)
PRICE_RE=re.compile(r'[$€£]\s?[0-9][0-9,.]*|USD\s?[0-9][0-9,.]*|[0-9][0-9,.]*\s?(?:USD|eur|euro|€|gbp|£)', re.I)


def load_json(path, default):
    try: return json.loads(Path(path).read_text())
    except Exception: return default

def is_bad_media_url(u):
    s = str(u or '').lower()
    return any(x in s for x in ['cdn.jsdelivr.net/joypixels', 'joypixels/assets', '/smilies/', '/styles/', '/avatars/', 'favicon'])

STATUS_HISTORY_PATH = DATA_DIR / 'status_history.json'


def rwi_label_history():
    data_dir = ROOT/'rwi_mvp'/'data'
    label_by_url = {}
    ever_price_drop = set()
    price_note_by_url = {}
    for path in sorted(data_dir.glob('rwi_bookmarklet_*.json')):
        payload = load_json(path, {})
        rows = payload.get('rows') if isinstance(payload, dict) else None
        if not isinstance(rows, list) or not rows:
            continue
        for row in rows:
            url = (row.get('url') or '').rstrip('/')
            if not url:
                continue
            label = str(row.get('label') or '').strip()
            if label:
                label_by_url[url] = label
            if re.search(r'\[PRICE\s*DROP\]|\[PRICEDROP\]', label, re.I):
                ever_price_drop.add(url)
            note = str(row.get('priceNote') or '').strip()
            if note:
                price_note_by_url[url] = note
    return label_by_url, ever_price_drop, price_note_by_url


def item_history_key(item):
    if item.get('sourceGroup') == 'rwi' and item.get('url'):
        return item.get('url').rstrip('/')
    return item.get('id') or item.get('url') or item.get('title')


def apply_status_history(rows):
    history = load_json(STATUS_HISTORY_PATH, {})
    changed = False
    now_iso = NOW.isoformat()
    for item in rows:
        key = item_history_key(item)
        if not key:
            continue
        status_value = item.get('status') or 'unknown'
        entry = history.get(key)
        if not entry:
            entry = {
                'id': item.get('id'),
                'source': item.get('source'),
                'title': item.get('title'),
                'url': item.get('url'),
                'firstSeenAt': now_iso,
                'lastSeenAt': now_iso,
                'currentStatus': status_value,
                'changes': [{'at': now_iso, 'status': status_value}],
            }
            history[key] = entry
            changed = True
        else:
            entry['lastSeenAt'] = now_iso
            entry['title'] = item.get('title') or entry.get('title')
            entry['url'] = item.get('url') or entry.get('url')
            if entry.get('currentStatus') != status_value:
                entry.setdefault('changes', []).append({
                    'at': now_iso,
                    'from': entry.get('currentStatus'),
                    'status': status_value,
                })
                entry['currentStatus'] = status_value
                changed = True
        item['firstSeenAt'] = entry.get('firstSeenAt')
        item['statusUpdatedAt'] = (entry.get('changes') or [{}])[-1].get('at')
        item['previousStatus'] = (entry.get('changes') or [{}])[-1].get('from')
        item['statusHistory'] = entry.get('changes', [])[-5:]
    if changed:
        STATUS_HISTORY_PATH.write_text(json.dumps(history, indent=2))
    return rows

def clean_title(s):
    s=s or 'Untitled'
    s=re.sub(r'\| Replica Watch Info$', '', s)
    s=re.sub(r'^\[(?:PENDING|FOR SALE|SOLD|STAFF REVIEW|GEN WATCH|PRICE\s?DROP|PRICEDROP|WTS|FS)[^\]]*\]\s*[-–:]?\s*', '', s, flags=re.I)
    s=re.sub(r'^\((?:US|USA|CONUS|EU|UK|WW|CAN|CH)[^)]+\)\s*', '', s, flags=re.I)
    s=re.sub(r'✅\s*Seller\s*Code\s*:?\s*\d+', '', s, flags=re.I)
    s=re.sub(r'\s+', ' ', s).strip(' -–—,:')
    return s or 'Untitled'

def status(s):
    s=(s or '').lower()
    if 'staff review' in s: return 'staff_review'
    if 'gen watch' in s: return 'gen_watch'
    if 'pending' in s: return 'pending'
    if 'for sale' in s or 'available' in s or 'pricedrop' in s or 'price drop' in s or 'wts' in s: return 'available'
    if SOLD_RE.search(s): return 'sold'
    return 'unknown'

def price(row):
    for k in ('askingPrice','price','cost'):
        v=row.get(k)
        if v not in (None,''): return str(v)
    vals=row.get('prices') or []
    if vals:
        try: return f"${int(float(vals[0]))}"
        except Exception: return str(vals[0])
    if row.get('minPrice') is not None:
        try: return f"${int(float(row['minPrice']))}"
        except Exception: return str(row['minPrice'])
    m=PRICE_RE.search((row.get('title') or '')+' '+(row.get('source_post_title') or ''))
    return m.group(0) if m else ''

def parse_rwi_dt(s):
    if not s: return None
    for fmt in ('%Y-%m-%dT%H:%M:%S%z',):
        try: return datetime.strptime(s,fmt).astimezone(ET)
        except Exception: pass
    return None

def parse_posted(v):
    if not v: return None
    if isinstance(v,(int,float)): return datetime.fromtimestamp(float(v), ET)
    s=str(v).strip().lower()
    try: return datetime.fromisoformat(s.replace('z','+00:00')).astimezone(ET)
    except Exception: pass
    m=re.match(r'(\d+)m ago',s)
    if m: return NOW-timedelta(minutes=int(m.group(1)))
    m=re.match(r'(\d+)h ago',s)
    if m: return NOW-timedelta(hours=int(m.group(1)))
    if s in ('today','just now'): return NOW
    return None

def ext_for(url, ctype=''):
    path=urlparse(url).path.lower()
    for e in ('.jpg','.jpeg','.png','.webp','.gif'):
        if path.endswith(e): return e
    if 'png' in ctype: return '.png'
    if 'webp' in ctype: return '.webp'
    if 'gif' in ctype: return '.gif'
    return '.jpg'

def download_image(url, referer=''):
    key=hashlib.sha1(url.encode()).hexdigest()[:18]
    existing=list(FULL_DIR.glob(key+'.*'))
    if existing: return existing[0]
    req=Request(url,headers={'User-Agent':'Mozilla/5.0','Accept':'image/avif,image/webp,image/apng,image/*,*/*;q=0.8','Referer':referer or 'https://www.reddit.com/'})
    with urlopen(req,timeout=8) as r:
        data=r.read(8_000_000); ctype=r.headers.get('content-type','')
    if len(data)<500: raise ValueError('tiny image')
    ext=ext_for(url,ctype)
    path=FULL_DIR/(key+ext)
    path.write_bytes(data)
    return path

def make_thumb(src):
    key=src.stem+'.jpg'
    out=THUMB_DIR/key
    if out.exists(): return out
    im=Image.open(src).convert('RGB')
    im=ImageOps.exif_transpose(im)
    im.thumbnail((520,390), Image.Resampling.LANCZOS)
    canvas=Image.new('RGB',(520,390),(13,17,24))
    x=(520-im.width)//2; y=(390-im.height)//2
    canvas.paste(im,(x,y))
    canvas.save(out,quality=76,optimize=True,progressive=True)
    return out

def localize_images(urls, referer, limit=20):
    full=[]; thumbs=[]
    for u in (urls or [])[:limit]:
        try:
            f=download_image(u, referer)
            t=make_thumb(f)
            full.append('/images/full/'+f.name)
            thumbs.append('/images/thumbs/'+t.name)
        except Exception:
            continue
    return thumbs, full

def image_sources_from_temp():
    mp={}
    for path in sorted(DATA_DIR.glob('rwi-images-2026-*.json'), key=lambda p: p.name, reverse=True):
        rwi_images=load_json(path, {})
        for row in rwi_images.get('rows', []):
            if row.get('url') and row.get('images'):
                url = str(row['url'])
                imgs = row.get('images') or []
                if url not in mp or len(imgs) > len(mp[url]):
                    mp[url] = imgs
                    mp[url.rstrip('/')] = imgs
    reddit_images=load_json(DATA_DIR/f'reddit-images-{TODAY}.json', {})
    for row in reddit_images.get('rows', []):
        if row.get('url') and row.get('images'):
            url = str(row['url'])
            imgs = row.get('images') or []
            mp[url] = imgs
            mp[url.rstrip('/')] = imgs
    temp=load_json(ROOT/'tmp_watch_aggregate'/'today_dashboard'/'watch-dashboard-local.json', {})
    for it in temp.get('items',[]):
        if it.get('url') and it.get('url') not in mp:
            url = str(it['url'])
            imgs = it.get('images') or []
            mp[url] = imgs
            mp[url.rstrip('/')] = imgs
    # convert temp local images into app cache, if present
    base=ROOT/'tmp_watch_aggregate'/'today_dashboard'
    for url, imgs in list(mp.items()):
        new=[]
        for rel in imgs:
            p=base/rel if not str(rel).startswith('/') else Path(rel)
            if p.exists():
                key=hashlib.sha1((url+p.name).encode()).hexdigest()[:18]+p.suffix.lower()
                dest=FULL_DIR/key
                if not dest.exists(): shutil.copy2(p,dest)
                try: make_thumb(dest); new.append('/images/full/'+dest.name)
                except Exception: pass
            elif str(rel).startswith('http') and not is_bad_media_url(rel):
                new.append(rel)
        mp[url]=new or imgs
    return mp

def fetch_page_image_urls(url):
    if not url: return []
    try:
        req=Request(url, headers={'User-Agent':'Mozilla/5.0', 'Accept':'text/html,*/*'})
        with urlopen(req, timeout=7) as r:
            body=r.read(2_000_000).decode('utf-8','ignore')
    except Exception:
        return []
    out=[]
    for m in re.finditer(r'''(?:href|src|data-src|data-url)=["']([^"']+)["']''', body, re.I):
        u=html.unescape(m.group(1))
        if u.startswith('//'): u='https:'+u
        elif u.startswith('/'):
            try:
                from urllib.parse import urljoin
                u=urljoin(url,u)
            except Exception: pass
        if re.search(r'^https?://(?:www\.)?clickpix\.org/image/', u, re.I):
            try:
                req2=Request(u, headers={'User-Agent':'Mozilla/5.0', 'Accept':'text/html,*/*'})
                with urlopen(req2, timeout=7) as r2:
                    body2=r2.read(2_000_000).decode('utf-8','ignore')
                m2=re.search(r'''property=["']og:image["'][^>]*content=["']([^"']+)["']''', body2, re.I)
                if not m2:
                    m2=re.search(r'''property=["']twitter:image["'][^>]*content=["']([^"']+)["']''', body2, re.I)
                if m2:
                    u=m2.group(1)
            except Exception:
                pass
        if re.search(r'(clickpix|imgur|ibb\.co|postimg|external-preview\.redd\.it|i\.redd\.it|preview\.redd\.it|media\.redd\.it|\.jpe?g|\.png|\.webp)(?:[?#/]|$)', u, re.I) and not re.search(r'avatar|smilie|logo|sprite|emoji|styles', u, re.I) and not re.search(r'clickpix\.org/image/', u, re.I) and not is_bad_media_url(u):
            out.append(u)
    return list(dict.fromkeys(out))[:3]


def reddit_blob_image_map():
    mp={}
    raw_dir=ROOT/'reddit_bst'/'data'/'raw'
    files=list(raw_dir.glob('blob*_full*.txt')) + [ROOT/'reddit_bst'/'repwatch_blob_page1.txt']
    reddit_url_re=re.compile(r'/url:\s*(https://www\.reddit\.com/r/[^\s]+)', re.I)
    img_re=re.compile(r'/url:\s*(https://(?:preview\.redd\.it|i\.redd\.it)/[^\s]+)', re.I)
    for path in files:
        if not path.exists(): continue
        current=None
        for line in path.read_text(errors='ignore').splitlines():
            m=reddit_url_re.search(line)
            if m:
                current=m.group(1).rstrip('/')
                mp.setdefault(current, [])
                continue
            im=img_re.search(line)
            if im and current:
                imgs=mp.setdefault(current, [])
                imgs.append(html.unescape(im.group(1)).replace('&amp;', '&'))
    # Current BSTRepWatch browser refresh now stores per-post images directly.
    current_blob = ROOT/'reddit_bst'/'data'/'current_from_blob.json'
    if current_blob.exists():
        try:
            obj = json.loads(current_blob.read_text())
            for row in obj.get('rows', []):
                url = row.get('url')
                imgs = [u for u in (row.get('images') or []) if u]
                if url and imgs:
                    mp.setdefault(url.rstrip('/'), []).extend(imgs)
                    mp.setdefault(url, []).extend(imgs)
        except Exception:
            pass
    return {k:list(dict.fromkeys(v)) for k,v in mp.items() if v}

def latest_reddit_raw_image_map():
    mp={}
    caps=ROOT/'reddit_bst'/'captures'
    if not caps.exists(): return mp

    def aliases(post):
        out=[]
        pid=post.get('id') or ''
        permalink=post.get('permalink') or ''
        if pid: out.append(pid)
        if permalink:
            out.append('https://www.reddit.com'+permalink)
            out.append('https://old.reddit.com'+permalink)
            out.append(permalink.rstrip('/'))
        u=post.get('url') or ''
        if u: out.append(u)
        if pid:
            out.append(f'https://www.reddit.com/gallery/{pid}')
        return [a.rstrip('/') for a in out if a]

    def add_img(imgs, u):
        if not u: return
        u=html.unescape(str(u)).replace('&amp;', '&')
        if u.startswith('//'): u='https:'+u
        if re.search(r'(preview\.redd\.it|external-preview\.redd\.it|i\.redd\.it|media\.redd\.it|redditmedia|imgur|ibb\.co|postimg|\.jpe?g|\.png|\.webp)(?:[?#/]|$)', u, re.I):
            imgs.append(u)

    # Use every recent direct capture instead of an arbitrary tiny slice. The aggregate
    # often contains posts from many scrape cycles, and exact permalink matching misses
    # gallery URLs / post ids.
    raw_files=sorted(caps.glob('*_direct_*.json'), key=lambda p:p.stat().st_mtime, reverse=True)[:180]
    for p in raw_files:
        obj=load_json(p,{})
        try: raw=json.loads(obj.get('body') or '{}')
        except Exception: continue
        for child in raw.get('data',{}).get('children',[]):
            post=child.get('data') or {}
            imgs=[]
            # Galleries: preserve gallery order when available.
            media_meta=post.get('media_metadata') or {}
            gallery_items=(post.get('gallery_data') or {}).get('items') or []
            media_ids=[x.get('media_id') for x in gallery_items if isinstance(x,dict) and x.get('media_id')] or list(media_meta.keys())
            for mid in media_ids:
                item=media_meta.get(mid) or {}
                if isinstance(item,dict):
                    src=item.get('s') or {}
                    add_img(imgs, src.get('u') or src.get('gif') or src.get('mp4'))
                    # Fallback to largest preview if source is absent.
                    previews=src and [] or item.get('p') or []
                    if previews:
                        best=sorted(previews, key=lambda x:x.get('x',0)*x.get('y',0), reverse=True)[0]
                        add_img(imgs, best.get('u'))
            # Single-image posts and thumbnails.
            add_img(imgs, post.get('url'))
            add_img(imgs, post.get('thumbnail'))
            try:
                add_img(imgs, post.get('preview',{}).get('images',[{}])[0].get('source',{}).get('url'))
            except Exception: pass
            # Crossposts sometimes hide the real media one layer down.
            for xp in post.get('crosspost_parent_list') or []:
                add_img(imgs, xp.get('url'))
                try: add_img(imgs, xp.get('preview',{}).get('images',[{}])[0].get('source',{}).get('url'))
                except Exception: pass
            imgs=list(dict.fromkeys(imgs))
            if not imgs: continue
            for key in aliases(post):
                mp.setdefault(key, imgs)
    return mp

def normalize():
    temp_imgs=image_sources_from_temp()
    reddit_raw_imgs=latest_reddit_raw_image_map()
    reddit_blob_imgs=reddit_blob_image_map()
    rwi_label_by_url, rwi_ever_price_drop, rwi_price_note_by_url = rwi_label_history()
    items=[]
    rwi=load_json(ROOT/'rwi_mvp'/'data'/'rwi.json', {})
    for t in rwi.get('threads',[]):
        url=(t.get('threadUrl') or '').rstrip('/')
        raw_label = str(t.get('label') or rwi_label_by_url.get(url) or f'[{t.get("status")}]').strip()
        st=status(raw_label or t.get('status'))
        # Keep SOLD rows in the normalized RWI feed. RWI often flips posts from
        # FOR SALE/PENDING to SOLD within the hourly window; dropping sold rows
        # made the dashboard preserve or imply stale availability.
        if st not in ('available','pending','sold','staff_review','gen_watch'): continue
        if not t.get('threadId') or not url or 'undefined' in url.lower():
            continue
        dt=parse_rwi_dt(t.get('threadTime') or t.get('startDate'))
        title=clean_title(t.get('title'))
        if not title or title == 'Untitled':
            continue
        imgs=temp_imgs.get(url, [])
        thumbs=[]; full=[]
        if imgs:
            # imgs may already be local app full paths, or remote URLs from the RWI extractor.
            local_full=[]; remote=[]
            for im in imgs[:20]:
                if str(im).startswith('/images/full/') and (PUBLIC/str(im).lstrip('/')).exists():
                    local_full.append(im)
                    p=PUBLIC/str(im).lstrip('/')
                    try: thumbs.append('/images/thumbs/'+make_thumb(p).name)
                    except Exception: pass
                elif str(im).startswith('http') and not re.search(r'clickpix\.org/image/', str(im), re.I) and not is_bad_media_url(im):
                    remote.append(im)
            if remote:
                # RWI images can be displayed directly from the extractor sidecar.
                # Downloading/localizing every remote image makes the daily build too
                # slow and was causing rebuild hangs. Keep local files when already
                # cached, otherwise fall back to the remote gallery URLs directly.
                local_full.extend(remote)
                if not thumbs:
                    thumbs.append(remote[0])
            full=local_full[:20]
        if not full and dt and dt.date().isoformat()==TODAY:
            remote=fetch_page_image_urls(url)
            thumbs, full=localize_images(remote, url)
        if not full and url:
            remote=fetch_page_image_urls(url)
            if remote:
                thumbs, full=localize_images(remote, url)
        post_type = (
            'price_drop' if re.search(r'\[PRICE\s*DROP\]|\[PRICEDROP\]', raw_label, re.I) or url in rwi_ever_price_drop
            else 'pending' if re.search(r'\[PENDING\]', raw_label, re.I)
            else 'sold' if re.search(r'\[SOLD\]', raw_label, re.I)
            else 'for_sale'
        )
        price_note = rwi_price_note_by_url.get(url, '')
        items.append({
            'id':'rwi:'+str(t.get('threadId')), 'source':'RWI', 'sourceGroup':'rwi', 'subreddit':'',
            'status':st, 'title':title, 'price':price(t), 'url':url, 'seller':t.get('author') or '',
            'postedAt':dt.isoformat() if dt else '', 'postedLabel':dt.strftime('%-I:%M %p') if dt else '',
            'sort':dt.timestamp() if dt else 0, 'location':t.get('location') or '', 'condition':t.get('condition') or '',
            'thumb':thumbs[0] if thumbs else '', 'images':full[:20], 'search':(' '.join([title,t.get('author') or '',t.get('location') or '',price(t), raw_label, price_note]).lower()),
            'label': raw_label, 'postType': post_type, 'priceNote': price_note, 'wasPriceDrop': url in rwi_ever_price_drop,
        })
    snap=load_json(ROOT/'reddit_bst'/'data'/'aggregate_snapshot.json', {})
    bulk_seen={}
    gallery_cache={}
    for r in snap.get('current',[]):
        st=status(r.get('status'))
        if st not in ('available','pending'): continue
        if (r.get('kind') or '').lower()=='accessory': continue
        dt=parse_posted(r.get('posted'))
        if not dt: continue
        # default view is recent/today-ish, but keep date metadata for later history
        title=clean_title(r.get('title') or r.get('source_post_title'))
        if not WATCH_HINT.search(title): continue
        url=r.get('post_url') or r.get('url') or ''
        thumbs=[]; full=[]
        raw_imgs = (reddit_raw_imgs.get(url.rstrip('/')) or reddit_raw_imgs.get(str(r.get('post_id') or '').rstrip('/')) or reddit_blob_imgs.get(url.rstrip('/')) or reddit_blob_imgs.get(str(r.get('post_id') or '').rstrip('/')) or [])
        source_imgs=[]
        for im in (temp_imgs.get(url, []) or []) + (raw_imgs or []):
            if im not in source_imgs:
                source_imgs.append(im)

        if r.get('bulk') and source_imgs and dt.date().isoformat()==TODAY:
            # Bulk posts contain many parsed watch rows under one Reddit gallery. Avoid
            # expensive pre-downloads and avoid repeating image #1 for every row: use
            # gallery order as a heuristic and let the browser lazy-load Reddit images.
            gallery=[]
            for im in source_imgs:
                if str(im).startswith('/images/full/') and (PUBLIC/str(im).lstrip('/')).exists():
                    gallery.append(im)
                elif str(im).startswith('http') and not re.search(r'clickpix\.org/image/', str(im), re.I) and not is_bad_media_url(im):
                    gallery.append(str(im))
            gallery=list(dict.fromkeys(gallery))
            idx=bulk_seen.get(url,0); bulk_seen[url]=idx+1
            if gallery:
                pick=idx % len(gallery)
                full=[gallery[pick]] + [x for x in gallery if x != gallery[pick]][:11]
                thumbs=[gallery[pick]]
        else:
            remote=[]
            for im in source_imgs:
                if str(im).startswith('/images/full/') and (PUBLIC/str(im).lstrip('/')).exists():
                    p=PUBLIC/str(im).lstrip('/'); full.append('/images/full/'+p.name)
                    try: thumbs.append('/images/thumbs/'+make_thumb(p).name)
                    except Exception: pass
                elif str(im).startswith('http') and not re.search(r'clickpix\.org/image/', str(im), re.I) and not is_bad_media_url(im):
                    remote.append(str(im))
            if remote:
                # Reddit images can be displayed directly; downloading every image makes
                # the daily build too slow. Keep local files when already cached, but use
                # remote URLs as the fallback gallery.
                full.extend(remote)
                if not thumbs: thumbs.append(remote[0])
        if not full and dt.date().isoformat()==TODAY:
            remote=fetch_page_image_urls(url)
            if remote:
                full.extend(remote); thumbs.append(remote[0])
        raw_sub=str(r.get('subreddit') or 'Reddit')
        pretty_sub={
            'watchexchangeBST':'WatchExchangeBST',
            'repwatchbuysell':'repwatchbuysell',
            'repwatchbuyselltrade':'repwatchbuyselltrade',
            'TheRepTimeBST':'TheRepTimeBST',
            'watchconnect':'watchconnect',
            'BSTRepWatch':'BSTRepWatch',
        }.get(raw_sub, raw_sub)
        items.append({
            'id':'reddit:'+str(r.get('listing_id') or hashlib.sha1((url+title).encode()).hexdigest()[:12]),
            'source':'Reddit / '+pretty_sub, 'sourceGroup':'reddit', 'subreddit':pretty_sub,
            'status':st, 'title':title, 'price':price(r), 'url':url, 'seller':r.get('seller') or '',
            'postedAt':dt.isoformat(), 'postedLabel':dt.strftime('%-I:%M %p'), 'sort':dt.timestamp(),
            'location':'', 'condition':'', 'thumb':thumbs[0] if thumbs else '', 'images':full[:6],
            'search':(' '.join([title,r.get('seller') or '',pretty_sub,price(r)])).lower()
        })
    # de-dupe by source + url + title, prefer image and newer
    best={}
    for it in items:
        key=(it['sourceGroup'],it.get('url',''),re.sub(r'\W+',' ',it['title'].lower()).strip())
        old=best.get(key)
        if not old or (bool(it['thumb']) and not bool(old['thumb'])) or it['sort']>old['sort']:
            old=best.get(key)
            if old:
                if len(old.get('images',[])) < len(it.get('images',[])):
                    print(f'DEBUG: replacing {key[:60]} images {len(old.get("images",[]))}->{len(it.get("images",[]))}', file=sys.stderr)
            best[key]=it
    rows=sorted(best.values(),key=lambda x:-x['sort'])
    return rows

rows=apply_status_history(normalize())

def is_today_row(row):
    if (row.get('postedAt') or '').startswith(TODAY):
        return True
    # Keep actively-seen listings visible even when the original post timestamp
    # rolls over to the prior day. This prevents fresh Reddit/RWI refreshes from
    # disappearing out of the default Today view.
    if (row.get('firstSeenAt') or '').startswith(TODAY):
        return True
    if (row.get('statusUpdatedAt') or '').startswith(TODAY):
        return True
    return False

today_rows=[r for r in rows if is_today_row(r)]

def make_counts(items):
    counts={'all':len(items),'today':sum(1 for r in items if (r.get('postedAt') or '').startswith(TODAY)),'withImages':sum(1 for r in items if r.get('thumb')),'bySource':{},'byStatus':{}}
    for r in items:
        counts['bySource'][r['source']]=counts['bySource'].get(r['source'],0)+1
        counts['byStatus'][r['status']]=counts['byStatus'].get(r['status'],0)+1
    return counts

payload={
    'generatedAt':NOW.isoformat(),
    'date':TODAY,
    'counts':make_counts(today_rows),
    'currentCounts':make_counts(rows),
    'items':today_rows,
    'currentItems':rows,
}
(DATA_DIR/f'{TODAY}.json').write_text(json.dumps(payload,indent=2))
(DATA_DIR/'latest.json').write_text(json.dumps(payload,indent=2))
print(json.dumps({'out':str(DATA_DIR/'latest.json'),'todayCount':len(today_rows),'currentCount':len(rows),'withImages':payload['counts']['withImages'],'sources':payload['counts']['bySource']},indent=2))
