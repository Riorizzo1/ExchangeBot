#!/usr/bin/env python3
import json
p='/Users/bobby/.openclaw/workspace/watch_desk/public/data/latest.json'
d=json.load(open(p))
missing=[]
for x in d['currentItems']:
    if x.get('sourceGroup')=='rwi' and not str(x.get('price') or '').strip():
        missing.append((x.get('id'), x.get('title'), x.get('url')))
print('missing', len(missing))
for row in missing[:40]:
    print(row[0], '|', row[1], '|', row[2])
