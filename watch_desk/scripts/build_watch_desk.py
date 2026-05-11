#!/usr/bin/env python3
from __future__ import annotations
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

def clean_title(s):
    s=s or 'Untitled'
    s=re.sub(r'\| Replica Watch Info$', '', s)
    s=re.sub(r'^\[(?:PENDING|FOR SALE|SOLD|WTS|FS)[^\]]*\]\s*[-–:]?\s*', '', s, flags=re.I)
    s=re.sub(r'^\((?:US|USA|CONUS|EU|UK|WW|CAN|CH)[^)]+\)\s*', '', s, flags=re.I)
    s=re.sub(r'✅\s*Seller\s*Code\s*:?\s*\d+', '', s, flags=re.I)
    s=re.sub(r'\s+', ' ', s).strip(' -–—,:')
    return s or 'Untitled'

def status(s):
    s=(s or '').lower()
    if 'pending' in s: return 'pending'
    if 'for sale' in s or 'available' in s or 'wts' in s: return 'available'
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

def localize_images(urls, referer):
    full=[]; thumbs=[]
    for u in (urls or [])[:3]:
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
    rwi_images=load_json(DATA_DIR/f'rwi-images-{TODAY}.json', {})
    for row in rwi_images.get('rows', []):
        if row.get('url') and row.get('images'):
            mp[row['url']]=row.get('images') or []
    temp=load_json(ROOT/'tmp_watch_aggregate'/'today_dashboard'/'watch-dashboard-local.json', {})
    for it in temp.get('items',[]):
        if it.get('url') and it.get('url') not in mp:
            mp[it['url']]=it.get('images') or []
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
            elif str(rel).startswith('http'):
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
        if re.search(r'(clickpix|imgur|ibb\.co|postimg|i\.redd\.it|preview\.redd\.it|\.jpe?g|\.png|\.webp)(?:[?#/]|$)', u, re.I) and not re.search(r'avatar|smilie|logo|sprite|emoji|styles', u, re.I):
            out.append(u)
    return list(dict.fromkeys(out))[:3]

def latest_reddit_raw_image_map():
    mp={}
    caps=ROOT/'reddit_bst'/'captures'
    if not caps.exists(): return mp
    raw_files=sorted(caps.glob('*_direct_*.json'), key=lambda p:p.stat().st_mtime, reverse=True)[:12]
    for p in raw_files:
        obj=load_json(p,{})
        try: raw=json.loads(obj.get('body') or '{}')
        except Exception: continue
        for child in raw.get('data',{}).get('children',[]):
            post=child.get('data') or {}
            permalink='https://www.reddit.com'+(post.get('permalink') or '')
            imgs=[]
            if post.get('is_gallery') and post.get('media_metadata'):
                for item in post['media_metadata'].values():
                    if isinstance(item,dict):
                        s=item.get('s') or {}; u=s.get('u') or s.get('gif')
                        if u: imgs.append(html.unescape(u))
            if post.get('url') and re.search(r'(i\.redd\.it|\.jpe?g|\.png|\.webp)', post.get('url'), re.I):
                imgs.append(post['url'])
            try:
                src=post.get('preview',{}).get('images',[{}])[0].get('source',{}).get('url')
                if src: imgs.append(html.unescape(src))
            except Exception: pass
            if imgs and permalink not in mp:
                mp[permalink]=list(dict.fromkeys(imgs))[:6]
    return mp

def normalize():
    temp_imgs=image_sources_from_temp()
    reddit_raw_imgs=latest_reddit_raw_image_map()
    items=[]
    rwi=load_json(ROOT/'rwi_mvp'/'data'/'rwi.json', {})
    for t in rwi.get('threads',[]):
        st=status(t.get('status'))
        if st not in ('available','pending'): continue
        dt=parse_rwi_dt(t.get('threadTime') or t.get('startDate'))
        title=clean_title(t.get('title'))
        url=t.get('threadUrl') or ''
        imgs=temp_imgs.get(url, [])
        thumbs=[]; full=[]
        if imgs:
            # imgs may already be local app full paths, or remote URLs from the RWI extractor.
            local_full=[]; remote=[]
            for im in imgs[:6]:
                if str(im).startswith('/images/full/') and (PUBLIC/str(im).lstrip('/')).exists():
                    local_full.append(im)
                    p=PUBLIC/str(im).lstrip('/')
                    try: thumbs.append('/images/thumbs/'+make_thumb(p).name)
                    except Exception: pass
                elif str(im).startswith('http'):
                    remote.append(im)
            if remote:
                rt, rf = localize_images(remote, url)
                thumbs.extend(rt); local_full.extend(rf)
            full=local_full
        if not full and dt and dt.date().isoformat()==TODAY:
            remote=fetch_page_image_urls(url)
            thumbs, full=localize_images(remote, url)
        items.append({
            'id':'rwi:'+str(t.get('threadId')), 'source':'RWI', 'sourceGroup':'rwi', 'subreddit':'',
            'status':st, 'title':title, 'price':price(t), 'url':url, 'seller':t.get('author') or '',
            'postedAt':dt.isoformat() if dt else '', 'postedLabel':dt.strftime('%-I:%M %p') if dt else '',
            'sort':dt.timestamp() if dt else 0, 'location':t.get('location') or '', 'condition':t.get('condition') or '',
            'thumb':thumbs[0] if thumbs else '', 'images':full[:6], 'search':(' '.join([title,t.get('author') or '',t.get('location') or '',price(t)])).lower()
        })
    snap=load_json(ROOT/'reddit_bst'/'data'/'aggregate_snapshot.json', {})
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
        for im in temp_imgs.get(url, [])[:6]:
            if str(im).startswith('/images/full/') and (PUBLIC/str(im).lstrip('/')).exists():
                p=PUBLIC/str(im).lstrip('/'); full.append(im)
                try: thumbs.append('/images/thumbs/'+make_thumb(p).name)
                except Exception: pass
        if not full and dt.date().isoformat()==TODAY and url in reddit_raw_imgs:
            thumbs, full=localize_images(reddit_raw_imgs[url], url)
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
            best[key]=it
    rows=sorted(best.values(),key=lambda x:-x['sort'])
    return rows

rows=normalize()
counts={'all':len(rows),'today':sum(1 for r in rows if (r.get('postedAt') or '').startswith(TODAY)),'withImages':sum(1 for r in rows if r.get('thumb')),'bySource':{},'byStatus':{}}
for r in rows:
    counts['bySource'][r['source']]=counts['bySource'].get(r['source'],0)+1
    counts['byStatus'][r['status']]=counts['byStatus'].get(r['status'],0)+1
payload={'generatedAt':NOW.isoformat(),'date':TODAY,'counts':counts,'items':rows}
(DATA_DIR/f'{TODAY}.json').write_text(json.dumps(payload,indent=2))
(DATA_DIR/'latest.json').write_text(json.dumps(payload,indent=2))
print(json.dumps({'out':str(DATA_DIR/'latest.json'),'count':len(rows),'withImages':counts['withImages'],'sources':counts['bySource']},indent=2))
