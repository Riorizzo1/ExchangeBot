#!/usr/bin/env python3
from pathlib import Path
text=Path('/Users/bobby/.openclaw/workspace/watch_desk/public/index.html').read_text(errors='ignore')
for needle in ['const money=', 'price">${', 'Price ${', 'N/A']:
    i=text.find(needle)
    print('\nNEEDLE', needle, i)
    if i!=-1:
        print(text[max(0,i-700):i+1400])
