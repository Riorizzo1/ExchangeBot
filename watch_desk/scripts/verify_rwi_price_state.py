#!/usr/bin/env python3
import json, re
from pathlib import Path
root=Path('/Users/bobby/.openclaw/workspace')
for path in [root/'watch_desk/public/data/latest.json', root/'watch_desk/public/index.html', root/'watch_desk/public/v2.html']:
    text=path.read_text(errors='ignore')
    if path.suffix == '.json':
        payload=json.loads(text); cards=payload.get('currentItems') or payload.get('cards') or payload.get('items') or []
    else:
        m=re.search(r'window\.WATCH_DESK_V2=(.*?);</script>', text, re.S)
        payload=json.loads(m.group(1)); cards=payload.get('cards') or []
    rwi=[c for c in cards if c.get('sourceGroup')=='rwi']
    fake=[c for c in rwi if str(c.get('price')) in ('$1','$0')]
    priced=[c for c in rwi if str(c.get('price') or '').strip() and str(c.get('price')) not in ('$1','$0')]
    blank=[c for c in rwi if not str(c.get('price') or '').strip()]
    print(path.name, {'rwi':len(rwi),'priced':len(priced),'blank':len(blank),'fake':len(fake), 'sample_priced':[(c.get('id'),c.get('price')) for c in priced[:5]]})
