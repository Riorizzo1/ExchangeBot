#!/usr/bin/env python3
from pathlib import Path
ROOT=Path('/Users/bobby/.openclaw/workspace/watch_desk/public')
old="""const money=s=>{let m=String(s||'').replace(/,/g,'').match(/[0-9]+(?:\\.[0-9]+)?/);return m?Number(m[0]):null}; const price=s=>{let n=money(s);return n==null?'Price n/a':'$'+Math.round(n).toLocaleString()};"""
new="""const money=s=>{let m=String(s||'').replace(/,/g,'').match(/[0-9]+(?:\\.[0-9]+)?/);return m?Number(m[0]):null}; const price=s=>{let raw=String(s||'').trim(); if(!raw)return 'Open thread'; let n=money(raw); if(n==null)return raw; let sym=raw.includes('€')?'€':raw.includes('£')?'£':'$'; return sym+Math.round(n).toLocaleString()};"""
for p in [ROOT/'index.html', ROOT/'v2.html']:
    text=p.read_text(errors='ignore')
    if old not in text and new not in text:
        raise SystemExit(f'price renderer pattern missing in {p}')
    text=text.replace(old,new)
    p.write_text(text)
    print(p, 'patched', new in text, 'old_left', old in text, 'price_na_left', 'Price n/a' in text)
