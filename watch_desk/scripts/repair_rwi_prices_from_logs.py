#!/usr/bin/env python3
from __future__ import annotations
import json, re
from pathlib import Path
ROOT=Path('/Users/bobby/.openclaw/workspace')
DATA=ROOT/'watch_desk/public/data/latest.json'
DATED=ROOT/'watch_desk/public/data/2026-06-03.json'
LOGDIR=ROOT/'rwi_mvp/logs'
BAD={'','n/a','price n/a','$0','$1'}
PRICE=re.compile(r'([€£$]\s?[0-9][0-9,.]*(?:\s?[-–]\s?[€£$]?[0-9][0-9,.]*)?|(?:USD|EUR|GBP)\s?[0-9][0-9,.]*)', re.I)
TID=re.compile(r'(?:threads/[^\s"\']+\.|threadId["\']?\s*[:=]\s*["\']?)(\d{7,})')

def load(p): return json.loads(p.read_text())
def save(p,o): p.write_text(json.dumps(o,indent=2))
def clean(p):
    s=str(p or '').strip()
    if s.lower() in BAD: return ''
    if not PRICE.search(s): return ''
    m=re.match(r'^([€£$])\s?(\d{5,6})$', s)
    if m:
        n=int(m.group(2))
        if n%100==0 and n>5000: s=f'{m.group(1)}{n//100}'
    return s

def missing_ids(payload):
    ids=[]
    for x in payload.get('currentItems',[]):
        if x.get('sourceGroup')=='rwi' and not clean(x.get('price')):
            ids.append(str(x.get('id','')).replace('rwi:',''))
    return set(ids)

payload=load(DATA); missing=missing_ids(payload)
found={}
# Parse logs line-by-line for thread id near a currency price.
for p in sorted(LOGDIR.glob('*.log'), key=lambda p:p.stat().st_mtime, reverse=True):
    txt=p.read_text(errors='ignore')
    for tid in list(missing - set(found)):
        i=txt.find(tid)
        if i < 0: continue
        window=txt[max(0,i-1500):i+2500]
        # Prefer explicit askingPrice/price JSON-ish fields near this id.
        candidates=[]
        for pat in [r'askingPrice["\']?\s*[:=]\s*["\']([^"\']+)', r'price["\']?\s*[:=]\s*["\']([^"\']+)', r'Asking Price\??\s*([^\n\r,;|<]{1,40})']:
            for m in re.finditer(pat, window, re.I): candidates.append(m.group(1))
        candidates += [m.group(1) for m in PRICE.finditer(window)]
        for c in candidates:
            val=clean(c)
            if val:
                found[tid]=val
                break

repaired=0
for path in [DATA, DATED]:
    if not path.exists(): continue
    obj=load(path)
    for key in ['items','currentItems','cards']:
        for x in obj.get(key,[]) if isinstance(obj.get(key),list) else []:
            tid=str(x.get('id','')).replace('rwi:','')
            if tid in found and not clean(x.get('price')):
                x['price']=found[tid]
                x.pop('priceUnknown',None)
                repaired+=1
    save(path,obj)
print(json.dumps({'found_from_logs':len(found),'repaired_fields':repaired,'sample':list(found.items())[:20]},indent=2))
