#!/usr/bin/env python3
from pathlib import Path
for f in [Path('watch_desk/public/index.html'), Path('watch_desk/public/v2.html')]:
    text=f.read_text(errors='ignore')
    print('\nFILE', f, 'len', len(text))
    for needle in ['latest.json', 'fetch(', 'Price N/A', 'N/A', 'price']:
        i=text.find(needle)
        print('NEEDLE', needle, i)
        if i!=-1:
            print(text[max(0,i-250):i+500])
