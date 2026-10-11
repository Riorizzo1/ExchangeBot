#!/usr/bin/env python3
import json
import re
from collections import OrderedDict
from pathlib import Path
from datetime import datetime

RUNS = Path('/Users/bobby/.openclaw/cron/runs/4721acfc-d057-4eae-bd4c-5062875a3639.jsonl')
OUT = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/morning_hourly_telegram_review.txt')
LINK_RE = re.compile(r'<(https://www\.reddit\.com/[^>]+)>')
TITLE_RE = re.compile(r'^-\s+(.*?)(?:,\s*\$[0-9]|\n|$)')
BULK_ITEM_RE = re.compile(r'^\s*-\s+(.*?)(?:,\s*\$[0-9]|\n|$)')
SOURCE_LINE_RE = re.compile(r'^\s*Source:\s*<(https://www\.reddit\.com/[^>]+)>\s*$')
SUB_RE = re.compile(r'^(BSTRepWatch|repwatchbuysell|repwatchbuyselltrade|WatchExchangeBST|TheRepTimeBST|watchconnect)\s*$')

entries = []
for line in RUNS.read_text().splitlines():
    if not line.strip():
        continue
    row = json.loads(line)
    ts = datetime.fromtimestamp(row['runAtMs'] / 1000)
    if ts.date().isoformat() != '2026-04-24':
        continue
    if ts.hour < 11:  # 7 AM ET onward, stored in UTC so 11 = 7 ET
        continue
    entries.append((ts, row.get('summary', '')))

by_sub = OrderedDict()
current_sub = None
current_source = None
for ts, summary in entries:
    lines = summary.splitlines()
    for raw in lines:
        line = raw.rstrip()
        msub = SUB_RE.match(line.strip())
        if msub:
            current_sub = msub.group(1)
            by_sub.setdefault(current_sub, OrderedDict())
            current_source = None
            continue
        msource = SOURCE_LINE_RE.match(line)
        if msource:
            current_source = msource.group(1)
            continue
        if line.strip().startswith('- '):
            title = line.strip()[2:].strip()
            if title.lower().startswith('bulk post') or title.lower().startswith('packaging/accessory post') or title.lower().startswith('accessories') or title.lower().startswith('notes') or title.lower().startswith('no new'):
                continue
            if current_sub and current_source:
                by_sub[current_sub].setdefault((title, current_source), None)
        elif raw.startswith('  - '):
            title = raw.strip()[2:].strip()
            if current_sub and current_source:
                by_sub[current_sub].setdefault((title, current_source), None)

lines = []
lines.append('Telegram morning hourly review')
lines.append('Only items that actually appeared in the hourly Reddit Telegram outputs from 7 AM ET to now.')
lines.append('')
for sub, items in by_sub.items():
    if not items:
        continue
    lines.append(f'{sub} ({len(items)})')
    for title, url in items.keys():
        lines.append(f'• {title}')
        lines.append(f'<{url}>')
    lines.append('')

OUT.write_text('\n'.join(lines).strip() + '\n')
print(OUT)
