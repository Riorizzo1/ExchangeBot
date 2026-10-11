#!/usr/bin/env python3
from pathlib import Path
for p in sorted(Path('/Users/bobby/.openclaw/workspace/watch_desk').rglob('*')):
    if p.is_file():
        print(p.relative_to('/Users/bobby/.openclaw/workspace'))
