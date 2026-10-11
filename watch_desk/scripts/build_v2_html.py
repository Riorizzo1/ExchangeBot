#!/usr/bin/env python3
from __future__ import annotations
import json, re
from pathlib import Path
from datetime import datetime

ROOT = Path('/Users/bobby/.openclaw/workspace/watch_desk/public')
DATA = json.loads((ROOT / 'data/latest.json').read_text())
OUT = ROOT / 'v2.html'


def money(v):
    if v in (None, ''):
        return None
    m = re.search(r'[0-9]+(?:\.[0-9]+)?', str(v).replace(',', ''))
    return float(m.group(0)) if m else None


def fmt_price(v):
    n = money(v)
    if n is None:
        return 'Price n/a'
    return f'${int(n):,}' if n.is_integer() else f'${n:,.0f}'


def source_label(s):
    s = str(s or '')
    return (s.replace('Reddit / ', 'r/')
             .replace('repwatchbuyselltrade', 'RepWatchBST')
             .replace('repwatchbuysell', 'RepWatchBuySell'))


def status_label(s):
    return {
        'available': 'For Sale',
        'pending': 'Pending',
        'sold': 'Sold',
        'staff_review': 'Staff Review',
        'gen_watch': 'Gen Watch',
    }.get(str(s or ''), str(s or 'Unknown').replace('_', ' ').title())


def collapse_items(items):
    singles = []
    groups = {}
    for it in items:
        key = it.get('url') if it.get('sourceGroup') == 'reddit' else None
        if key:
            groups.setdefault(key, []).append(it)
        else:
            singles.append(it)

    cards = list(singles)
    for url, rows in groups.items():
        if len(rows) >= 3:
            imgs = []
            for r in rows:
                vals = r.get('images') or ([] if not r.get('thumb') else [r.get('thumb')])
                for img in vals:
                    if img and img not in imgs:
                        imgs.append(img)
            prices = [money(r.get('price')) for r in rows]
            prices = [p for p in prices if p is not None]
            if prices:
                minp, maxp = min(prices), max(prices)
                price = fmt_price(minp) if minp == maxp else f'{fmt_price(minp)}–{fmt_price(maxp)}'
            else:
                price = 'Price varies'
            first = rows[0]
            cards.append({
                'id': 'bulk:' + url,
                'bulk': True,
                'bulkCount': len(rows),
                'rows': rows,
                'url': url,
                'source': first.get('source'),
                'sourceGroup': first.get('sourceGroup'),
                'status': 'pending' if any(r.get('status') == 'pending' for r in rows) else 'available',
                'title': f'{len(rows)} watches in one seller post',
                'price': price,
                'seller': first.get('seller') or 'Unknown seller',
                'postedAt': first.get('postedAt'),
                'postedLabel': first.get('postedLabel'),
                'sort': max(r.get('sort') or 0 for r in rows),
                'thumb': imgs[0] if imgs else '',
                'images': imgs,
                'search': ' '.join((r.get('title') or '') + ' ' + (r.get('seller') or '') for r in rows).lower(),
            })
        else:
            cards.extend(rows)
    return sorted(cards, key=lambda x: -(x.get('sort') or 0))

payload = {
    'generatedAt': DATA.get('generatedAt'),
    'date': DATA.get('date'),
    'cards': collapse_items(DATA.get('items') or []),
    'currentCards': collapse_items(DATA.get('currentItems') or DATA.get('items') or []),
}

html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="refresh" content="120">
<title>Watch Desk v2</title>
<style>
:root{{--bg:#080a0d;--panel:#11151a;--panel2:#151a21;--panel3:#0d1116;--line:#2a323c;--line2:#3a4653;--text:#f3f5f7;--muted:#9aa5b1;--soft:#c8d0d8;--accent:#7f8ea3;--green:#65d18a;--amber:#e1b252;--danger:#e66d6d;}}
*{{box-sizing:border-box}} html,body{{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif}} body{{overflow-x:hidden}} button,input,select{{font:inherit}}
.app{{max-width:920px;margin:0 auto;padding:0 12px 34px}}.top{{position:sticky;top:0;z-index:50;background:rgba(8,10,13,.98);backdrop-filter:blur(14px);padding:12px 0 11px;border-bottom:1px solid var(--line)}}
.head{{display:flex;justify-content:space-between;align-items:end;margin-bottom:10px}}h1{{font-size:19px;line-height:1;margin:0;font-weight:780;letter-spacing:.01em}}.stamp{{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}}.stamp:before{{content:'Updated ';color:#717d89}}
.tabs,.status,.range{{display:grid;gap:6px}}.tabs{{grid-template-columns:repeat(3,1fr);margin-bottom:7px}}.status{{grid-template-columns:repeat(3,1fr);margin-bottom:7px}}.range{{grid-template-columns:repeat(2,1fr);margin-top:7px}}
button{{border:1px solid var(--line);background:var(--panel);color:var(--soft);border-radius:4px;padding:8px 6px;font-size:12px;font-weight:720;min-width:0;letter-spacing:.01em}}button.on{{background:#202834;border-color:#566579;color:#f8fafc}}.status button{{font-size:11px;padding:7px 3px}}.range button{{background:#0e1319}}
.searchrow{{display:grid;grid-template-columns:minmax(0,1fr) 108px;gap:7px}}.search{{height:40px;border:1px solid var(--line);border-radius:4px;background:var(--panel3);display:flex;align-items:center;gap:8px;padding:0 11px;color:var(--muted)}}input{{width:100%;height:38px;background:transparent;border:0;outline:0;color:var(--text);font-size:14px}}input::placeholder{{color:#747f8b}}select{{height:40px;border:1px solid var(--line);border-radius:4px;background:var(--panel3);color:var(--text);font-size:12px;padding:0 8px;min-width:0}}
.summary{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:12px 2px 9px}}.stat{{border:1px solid var(--line);background:var(--panel);border-radius:4px;padding:8px 9px;min-width:0;display:flex;flex-direction:column;gap:2px}}.stat span{{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);font-weight:780}}.stat b{{color:var(--soft);font-weight:820;font-size:14px;line-height:1.1;font-variant-numeric:tabular-nums}}.list{{display:flex;flex-direction:column;gap:8px}}
.card{{display:grid;grid-template-columns:106px minmax(0,1fr);min-height:116px;background:var(--panel);border:1px solid rgba(255,255,255,.06);border-radius:5px;overflow:hidden;box-shadow:0 6px 14px rgba(0,0,0,.14)}}.card.bulk{{background:#121820;border-color:#435063}}.card:active{{border-color:var(--line2)}}
.pic{{position:relative;width:106px;height:116px;background:#0b1016;overflow:hidden}}.pic img{{width:100%;height:100%;object-fit:cover;display:block}}.pic.none{{display:grid;place-items:center;color:#8d98a5;font-size:11px;text-align:center;padding:8px;background:linear-gradient(135deg,#0c1117,#111821)}}.badge{{position:absolute;top:7px;left:7px;border-radius:3px;padding:3px 6px;font-size:8px;font-weight:850;text-transform:uppercase;letter-spacing:.07em;background:rgba(5,7,10,.78);color:#f6f7f9;border:1px solid rgba(255,255,255,.14)}}.available{{background:rgba(34,197,94,.18);color:#baf7ce;border-color:rgba(34,197,94,.45)}}.pending{{background:rgba(245,158,11,.18);color:#ffe2a0;border-color:rgba(245,158,11,.45)}}.sold{{background:rgba(148,163,184,.18);color:#cbd5e1;border-color:rgba(148,163,184,.45)}}.staff_review{{background:rgba(96,165,250,.18);color:#bfdbfe;border-color:rgba(96,165,250,.45)}}.gen_watch{{background:rgba(168,85,247,.18);color:#e9d5ff;border-color:rgba(168,85,247,.45)}}.bulkbadge{{background:rgba(148,163,184,.22);color:#f8fafc;border-color:rgba(203,213,225,.45)}}
.info{{padding:10px 12px;min-width:0}}.src{{font-size:10px;font-weight:780;text-transform:uppercase;letter-spacing:.055em;color:#9aa7b5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px}}.type-badge{{display:inline-block;margin:0 0 6px;padding:2px 6px;border-radius:999px;font-size:9px;font-weight:800;letter-spacing:.02em;text-transform:none;vertical-align:1px;background:#10253f;color:#7fc0ff;border:1px solid #28527d}}.title{{font-size:14.5px;font-weight:760;line-height:1.24;color:#f4f6f8;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}}.price{{font-size:18px;font-weight:830;line-height:1;margin:8px 0 6px;color:#fff;font-variant-numeric:tabular-nums}}.meta{{font-size:12px;color:#aeb8c4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}.meta.missing{{color:#75818e;font-style:italic}}.load{{width:100%;margin-top:12px;border-radius:4px;background:var(--panel2);padding:12px}}
.drawer{{position:fixed;inset:0;background:rgba(0,0,0,.76);display:none;z-index:100}}.drawer.open{{display:block}}.sheet{{position:absolute;left:0;right:0;bottom:0;max-height:93vh;overflow:auto;-webkit-overflow-scrolling:touch;background:#0b1016;border-radius:10px 10px 0 0;padding:14px;border-top:1px solid var(--line)}}.x{{position:sticky;top:0;float:right;width:38px;height:38px;border-radius:7px;z-index:3;background:#1b2430}}.hero{{height:min(320px,42vh);background:#05070a;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin:46px 0 12px}}.hero img{{width:100%;height:100%;object-fit:contain}}.detailtitle{{font-size:21px;font-weight:820;line-height:1.13;margin:10px 0}}.thumbs{{display:flex;overflow-x:auto;gap:6px;margin-top:11px;padding-bottom:4px;scrollbar-width:thin}}.thumbs img{{flex-shrink:0;height:80px;width:auto;aspect-ratio:1;object-fit:cover;border-radius:6px;border:1px solid var(--line);cursor:pointer}}.thumbs img.on{{border-color:#93a4ba;box-shadow:0 0 0 2px rgba(147,164,186,.22)}}@media(min-width:720px){{.thumbs img{{height:94px}}}}
.bulklist{{margin-top:13px;border-top:1px solid var(--line)}}.bulkrow{{display:grid;grid-template-columns:1fr auto;gap:10px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)}}.bt{{font-size:13px;line-height:1.25;color:#f6f7f9}}.bp{{font-size:13px;font-weight:820;white-space:nowrap;color:#f6f7f9;font-variant-numeric:tabular-nums}}.open{{display:inline-flex;margin-top:13px;background:#202834;color:#f8fafc;border:1px solid #566579;border-radius:4px;padding:10px 12px;text-decoration:none;font-weight:820}}
@media(min-width:720px){{.summary{{grid-template-columns:repeat(5,minmax(0,1fr))}}.list{{display:grid;grid-template-columns:repeat(2,1fr)}}.card{{grid-template-columns:132px minmax(0,1fr)}}.pic{{width:132px;height:134px}}.card{{min-height:134px}}.title{{font-size:15px}}.drawer.open{{display:grid;place-items:center;padding:28px}}.sheet{{position:relative;left:auto;right:auto;bottom:auto;transform:none;width:min(900px,94vw);max-width:900px;max-height:88vh;border:1px solid var(--line);border-radius:12px;padding:18px 20px}}.hero{{height:min(460px,52vh);margin-top:8px}}
</style>
</head>
<body>
<div class="app"><div class="top"><div class="head"><h1>Watch Desk v2</h1><div class="stamp" id="stamp"></div></div><div class="tabs"><button class="on" data-view="all">All</button><button data-view="rwi">RWI</button><button data-view="reddit">Reddit</button></div><div class="status"><button class="on" data-status="active">Active</button><button data-status="available">Sale</button><button data-status="pending">Pending</button><button data-status="sold">Sold</button><button data-status="staff_review">Review</button><button data-status="gen_watch">Gen</button></div><div class="range"><button class="on" data-range="today">Today</button><button data-range="all">Current</button></div><div class="searchrow"><label class="search">⌕<input id="q" placeholder="Search watch, seller, factory"></label><select id="sort"><option value="newest">Newest</option><option value="priceLow">Price ↑</option><option value="priceHigh">Price ↓</option><option value="source">Source</option></select></div></div><div class="summary"><div class="stat"><span>Today</span><b id="todayTotal"></b></div><div class="stat"><span>Current</span><b id="currentTotal"></b></div><div class="stat"><span>Price drops</span><b id="priceDrops"></b></div><div class="stat"><span>Shown</span><b id="count"></b></div><div class="stat"><span>Images</span><b id="images"></b></div></div><main class="list" id="list"></main><button class="load" id="more">Load more</button></div>
<div class="drawer" id="drawer"><div class="sheet"><button class="x" id="close">×</button><div id="detail"></div></div></div>
<script>window.WATCH_DESK_V2={json.dumps(payload,separators=(',',':'))};</script>
<script>
const STORAGE_KEY='watch-desk-v2-state';
const DEFAULT_STATE={{view:'all',status:'active',range:'today',q:'',sort:'newest',visible:40}};
const ALLOWED={{view:['all','rwi','reddit'],status:['active','available','pending','sold','staff_review','gen_watch','all'],range:['today','all'],sort:['newest','priceLow','priceHigh','source']}};
function loadState(){{let raw={{}};try{{raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{{}}')||{{}}}}catch{{raw={{}}}}const s={{...DEFAULT_STATE,...raw}};for(const k of Object.keys(ALLOWED)){{if(!ALLOWED[k].includes(s[k]))s[k]=DEFAULT_STATE[k]}}s.q=String(s.q||'').slice(0,120);s.visible=DEFAULT_STATE.visible;return s}}
function saveState(){{try{{localStorage.setItem(STORAGE_KEY,JSON.stringify({{view:state.view,status:state.status,range:state.range,q:state.q,sort:state.sort,visible:Math.min(Number(state.visible)||40,160)}}))}}catch{{}}}}
function syncControls(){{$$("[data-view]").forEach(b=>b.classList.toggle('on',b.dataset.view===state.view)); $$("[data-status]").forEach(b=>b.classList.toggle('on',b.dataset.status===state.status)); $$("[data-range]").forEach(b=>b.classList.toggle('on',b.dataset.range===state.range)); $('#q').value=state.q; $('#sort').value=state.sort;}}
const data=window.WATCH_DESK_V2||{{}}, state=loadState(); const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s||'').replace(/[&<>"']/g,m=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}}[m])); const money=s=>{{let m=String(s||'').replace(/,/g,'').match(/[0-9]+(?:\.[0-9]+)?/);return m?Number(m[0]):null}}; const price=s=>{{let n=money(s);return n==null?'Price n/a':'$'+Math.round(n).toLocaleString()}}; const source=s=>String(s||'').replace(/^Reddit \/ /,'r/').replace('repwatchbuyselltrade','RepWatchBST').replace('repwatchbuysell','RepWatchBuySell'); const statusText=s=>({{available:'For Sale',pending:'Pending',sold:'Sold',staff_review:'Staff Review',gen_watch:'Gen Watch'}}[s]||String(s||'Unknown').replace('_',' ')); const isExternal=s=>/^https?:\\/\\//i.test(String(s||'')); const imgSrc=s=>{{s=String(s||'');return isExternal(s)?'/proxy-image?u='+encodeURIComponent(s):s}}; function onImgError(e){{const pic=e.target.closest('.pic');if(pic){{pic.classList.add('none');pic.textContent='No image'}}else e.target.style.display='none'}}
function base(){{const src=state.range==='all'?(data.currentCards||data.cards||[]):(data.cards||[]); return src.filter(i=>state.view==='all'||i.sourceGroup===state.view)}} function filtered(){{let out=base(); if(state.status==='active')out=out.filter(i=>['available','pending','staff_review','gen_watch'].includes(i.status)); else if(state.status!=='all')out=out.filter(i=>i.status===state.status); if(state.q){{let q=state.q.toLowerCase(); out=out.filter(i=>String(i.search||`${{i.title}} ${{i.seller}} ${{i.source}}`).toLowerCase().includes(q))}} if(state.sort==='priceLow')out.sort((a,b)=>(money(a.price)??Infinity)-(money(b.price)??Infinity)); else if(state.sort==='priceHigh')out.sort((a,b)=>(money(b.price)??-1)-(money(a.price)??-1)); else if(state.sort==='source')out.sort((a,b)=>String(a.source).localeCompare(String(b.source))||((b.sort||0)-(a.sort||0))); else out.sort((a,b)=>(b.sort||0)-(a.sort||0)); return out}}
function card(i){{const priceDrop=(i.postType==='price_drop'||i.wasPriceDrop)?'<span class="type-badge">Price Drop</span>':'';const thumb=i.thumb?imgSrc(i.thumb):'';return `<article class="card ${{i.bulk?'bulk':''}}" data-id="${{esc(i.id)}}"><div class="pic ${{i.thumb?'':'none'}}">${{i.thumb?`<img src="${{esc(thumb)}}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="onImgError(event)">`:'No image'}}${{i.thumb?`<span class="badge ${{i.bulk?'bulkbadge':esc(i.status)}}">${{i.bulk?'bulk':esc(statusText(i.status))}}</span>`:''}}</div><div class="info"><div class="src">${{esc(source(i.source))}}</div>${{priceDrop}}<div class="title">${{esc(i.title)}}</div><div class="price">${{esc(i.bulk?i.price:price(i.price))}}</div><div class="meta ${{(!i.bulk&&!i.seller)?'missing':''}}">${{esc(i.bulk?`${{(i.images||[]).length}} photos · ${{i.seller||'Unknown seller'}}`:(i.seller||'Seller unknown'))}}</div></div></article>`}}
function render(){{let out=filtered(), shown=out.slice(0,state.visible), todayCards=data.cards||[], currentCards=data.currentCards||todayCards; $('#todayTotal').textContent=todayCards.length; $('#currentTotal').textContent=currentCards.length; $('#priceDrops').textContent=currentCards.filter(i=>i.postType==='price_drop'||i.wasPriceDrop).length; $('#count').textContent=`${{shown.length}}/${{out.length}}`; $('#images').textContent=`${{currentCards.filter(i=>i.thumb).length}} imgs`; $('#list').innerHTML=shown.length?shown.map(card).join(''):'<div class="empty">No watches match these filters. Try Active / All / Today.</div>'; $('#more').style.display=out.length>shown.length?'block':'none'; $$('.card').forEach(c=>c.onclick=()=>open(c.dataset.id))}}
function open(id){{let i=filtered().find(x=>x.id===id)||base().find(x=>x.id===id); if(!i)return; let imgs=i.images&&i.images.length?i.images:(i.thumb?[i.thumb]:[]); let rows=i.bulk?`<div class="bulklist">${{(i.rows||[]).map(r=>`<div class="bulkrow"><div class="bt">${{esc(r.title)}}</div><div class="bp">${{esc(price(r.price))}}</div></div>`).join('')}}</div>`:''; const priceDrop=(i.postType==='price_drop'||i.wasPriceDrop)?'<div class="type-badge" style="margin-top:8px;display:inline-block;">Price Drop</div>':''; $('#detail').innerHTML=`${{imgs[0]?`<div class="hero"><img id="hero" src="${{esc(imgSrc(imgs[0]))}}" referrerpolicy="no-referrer" onerror="this.closest('.hero').textContent='No image'"></div>`:'<div class="hero pic none">No image</div>'}}<div class="src">${{esc(source(i.source))}} · ${{esc(i.postedLabel||'')}}</div>${{priceDrop}}<div class="detailtitle">${{esc(i.title)}}</div><div class="price">${{esc(i.bulk?i.price:price(i.price))}}</div><div class="meta ${{!i.seller?'missing':''}}">${{esc(i.seller||'Seller unknown')}}</div>${{imgs.length?`<div class="thumbs">${{imgs.map((x,n)=>`<img src="${{esc(imgSrc(x))}}" data-full="${{esc(x)}}" class="${{n===0?'on':''}}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`).join('')}}</div>`:''}}${{rows}}<a class="open" target="_blank" rel="noreferrer" href="${{esc(i.url)}}">Open source ↗</a>`; $('#drawer').classList.add('open'); $$('#detail .thumbs img').forEach(im=>im.onclick=e=>{{e.stopPropagation(); $('#hero').src=imgSrc(im.dataset.full); $$('#detail .thumbs img').forEach(x=>x.classList.remove('on')); im.classList.add('on')}})}}
function bindSelector(sel,key){{$$(sel).forEach(b=>b.onclick=()=>{{$$(sel).forEach(x=>x.classList.remove('on')); b.classList.add('on'); state[key]=b.dataset[key]; state.visible=40; saveState(); render()}})}} bindSelector('.tabs button[data-view]','view'); bindSelector('.status button[data-status]','status'); bindSelector('.range button[data-range]','range'); $('#q').oninput=e=>{{state.q=e.target.value.trim();state.visible=40;saveState();render()}}; $('#sort').onchange=e=>{{state.sort=e.target.value;saveState();render()}}; $('#more').onclick=()=>{{state.visible=Math.min(state.visible+40,160);saveState();render()}}; $('#close').onclick=()=>$('#drawer').classList.remove('open'); $('#drawer').onclick=e=>{{if(e.target.id==='drawer')$('#drawer').classList.remove('open')}}; $('#stamp').textContent=data.generatedAt?new Date(data.generatedAt).toLocaleString([],{{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}}):'n/a'; syncControls(); render(); saveState(); setTimeout(()=>{{ if(!$('#drawer').classList.contains('open')) location.replace(location.pathname + '?v=' + encodeURIComponent(data.generatedAt || Date.now())); }}, 120000);
</script></body></html>'''
OUT.write_text(html)
(ROOT / 'index.html').write_text(html)
print(json.dumps({'out': str(OUT), 'cards': len(payload['cards']), 'bulkCards': sum(1 for c in payload['cards'] if c.get('bulk'))}, indent=2))
