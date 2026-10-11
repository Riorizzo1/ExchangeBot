#!/usr/bin/env python3
from pathlib import Path
for f in [Path('watch_desk/public/index.html'), Path('watch_desk/public/v2.html')]:
    text=f.read_text(errors='ignore')
    print('\nFILE', f, 'len', len(text))
    for needle in ['__DATA__', 'window.', 'const ', 'let ', 'items:', 'currentItems', 'generatedAt', 'priceUnknown', '$1']:
        positions=[]
        start=0
        while True:
            i=text.find(needle,start)
            if i==-1: break
            positions.append(i); start=i+1
            if len(positions)>=5: break
        print('NEEDLE', needle, positions[:5])
        for i in positions[:2]: print(text[max(0,i-180):i+320])
