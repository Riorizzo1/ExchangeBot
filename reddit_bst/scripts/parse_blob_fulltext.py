#!/usr/bin/env python3
import ast
import json
import re
from pathlib import Path

SRC = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/raw/blob_full_text.txt')
OUT = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/fulltext_rows.json')

META_RE = re.compile(r'^\t(?P<prices>\$[\d,]+(?:, \$[\d,]+)*)\t(?P<status>For Sale|Pending|Sold|Unknown)\t(?P<tierfactory>[^\t]+)\tu/(?P<seller>[^\t]+)\t(?P<posted>.+)$')
COUNT_RE = re.compile(r'(?P<total>\d+) listings shown')
SUB_RE = re.compile(r'r/(?P<sub>\S+)\s+·\s+(?P<fs>\d+) for sale\s+·\s+(?P<pd>\d+) pending\s+·\s+(?P<sd>\d+) sold\s+·\s+(?P<uk>\d+) unknown')
SECTION_MARKERS = {'For Sale (833)', 'Pending (0)', 'Unknown Status (1)', 'Sold / Traded (71)'}


def parse_prices(s):
    vals = []
    for m in re.findall(r'\$([\d,]+)', s):
        n = int(m.replace(',', ''))
        if n not in vals:
            vals.append(n)
    return vals


def split_tier_factory(s):
    m = re.match(r'(elite|high|mid|low)(.+)$', s)
    if not m:
        return None, s or None
    return m.group(1), m.group(2)


def load_text():
    raw = SRC.read_text()
    start = raw.find('"')
    end = raw.rfind('"')
    if start == -1 or end <= start:
        raise SystemExit('No quoted payload found')
    payload = raw[start:end+1]
    return ast.literal_eval(payload)


def main():
    text = load_text()
    lines = text.splitlines()
    meta = {}
    rows = []
    section = None
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        m = COUNT_RE.search(stripped)
        if m:
            meta['shown'] = int(m.group('total'))
        m = SUB_RE.search(stripped)
        if m:
            meta['subreddit'] = m.group('sub')
            meta['for_sale'] = int(m.group('fs'))
            meta['pending'] = int(m.group('pd'))
            meta['sold'] = int(m.group('sd'))
            meta['unknown'] = int(m.group('uk'))
        if stripped in SECTION_MARKERS:
            section = stripped
            i += 1
            continue
        if stripped == 'Post / Photos\tPrice\tStatus\tFactory\tSeller\tPosted':
            i += 1
            continue
        if line.startswith('\t') and META_RE.match(line):
            i += 1
            continue
        title = stripped
        parent = None
        j = i + 1
        if j < len(lines) and lines[j].strip().startswith('↳ '):
            parent = lines[j].strip()[2:].strip()
            j += 1
        if j < len(lines) and lines[j].strip().startswith('+'):
            j += 1
        if j >= len(lines):
            i += 1
            continue
        meta_match = META_RE.match(lines[j])
        if not meta_match:
            i += 1
            continue
        tier, factory = split_tier_factory(meta_match.group('tierfactory'))
        rows.append({
            'section': section,
            'title': title,
            'parent_title': parent,
            'prices': parse_prices(meta_match.group('prices')),
            'status': meta_match.group('status'),
            'tier': tier,
            'factory': factory,
            'seller': meta_match.group('seller'),
            'posted': meta_match.group('posted'),
            'is_sub_listing': parent is not None,
        })
        i = j + 1
    OUT.write_text(json.dumps({'meta': meta, 'rows': rows}, indent=2))
    print(json.dumps({'meta': meta, 'rows': len(rows), 'out': str(OUT)}, indent=2))
    for r in rows[:20]:
        print(r)


if __name__ == '__main__':
    main()
