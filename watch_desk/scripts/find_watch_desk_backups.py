#!/usr/bin/env python3
from pathlib import Path
root=Path('/Users/bobby/.openclaw/workspace')
for base in [root/'watch_desk', root/'rwi_mvp']:
  for p in base.rglob('*'):
    if not p.is_file(): continue
    if p.suffix.lower() in {'.jpg','.jpeg','.png','.gif','.webp'}: continue
    if p.stat().st_size > 20_000_000: continue
    name=str(p.relative_to(root))
    if any(x in name for x in ['node_modules','.git']): continue
    try: txt=p.read_text(errors='ignore')[:5000]
    except Exception: continue
    if 'WATCH_DESK_V2' in txt or 'askingPrice' in txt or '11044057' in txt:
      print(name, p.stat().st_size)
