#!/usr/bin/env python3
import json
p='/Users/bobby/.openclaw/workspace/watch_desk/public/data/latest.json'
d=json.load(open(p))
for x in d['currentItems']:
    if x.get('sourceGroup')=='rwi' and not str(x.get('price') or '').strip():
        print(x['id'])
        print(x['url'])
        print(x['title'])
        break
