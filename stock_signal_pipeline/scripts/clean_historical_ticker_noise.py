#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTICLES = ROOT / 'data' / 'articles.jsonl'
TICKERS = ROOT / 'data' / 'tickers.json'
RECENT = ROOT / 'data' / 'recent_ticker_history.json'
NOISE = {'US', 'AT', 'YTD', 'NEW', 'YORK', 'PDT', 'UK'}

if ARTICLES.exists():
    lines = []
    for line in ARTICLES.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        row['tickers'] = [t for t in row.get('tickers', []) if t not in NOISE]
        lines.append(json.dumps(row))
    ARTICLES.write_text('\n'.join(lines) + ('\n' if lines else ''))

for path in [TICKERS, RECENT]:
    if path.exists():
        data = json.loads(path.read_text())
        changed = False
        for key in list(data.keys()):
            if key in NOISE:
                del data[key]
                changed = True
        if changed:
            path.write_text(json.dumps(data, indent=2))

print('cleaned historical ticker noise')
