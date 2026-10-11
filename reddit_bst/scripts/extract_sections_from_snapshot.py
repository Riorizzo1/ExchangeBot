#!/usr/bin/env python3
import json
import re
from pathlib import Path

SRC = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/raw/blob_page1_full.txt')
OUT = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/section_extract.json')

ROW_RE = re.compile(r'^\s*- row\s+\"(?P<summary>.*)\":\s*$')
LINK_RE = re.compile(r'^\s*- link\s+\"(?P<label>.*?)\"(?:\s+\[ref=.*?\])?:\s*$')
URL_RE = re.compile(r'^\s*- /url:\s+(?P<url>\S+)\s*$')
SECTION_RE = re.compile(r'^\s*- text:\s+(For Sale \(\d+\)|Pending \(\d+\)|Unknown Status \(\d+\)|Sold / Traded \(\d+\))\s*$')
HEADER_ROW = 'Post / Photos Price Status Factory Seller Posted'


def parse_price_list(text: str):
    vals = [int(x.replace(',', '')) for x in re.findall(r'\$(\d[\d,]*)', text)]
    dedup = []
    for v in vals:
        if v not in dedup:
            dedup.append(v)
    return dedup


def parse_factory(text: str):
    m = re.search(r'\b(elite|high|mid|low)\s+([A-Z0-9]+)\b', text)
    if not m:
        return None, None
    return m.group(1).lower(), m.group(2)


def parse_author(text: str):
    m = re.search(r'\bu/([A-Za-z0-9_\-]+)\b', text)
    return m.group(1) if m else None


def parse_posted(text: str):
    m = re.search(r'(\d+[mhdy]\s+ago)', text)
    return m.group(1) if m else None


def infer_status(summary: str):
    if ' For Sale ' in summary:
        return 'For Sale'
    if ' Pending ' in summary:
        return 'Pending'
    if ' Sold ' in summary:
        return 'Sold'
    return 'Unknown'


def main():
    lines = SRC.read_text().splitlines()
    section = None
    rows = []
    i = 0
    while i < len(lines):
        sm = SECTION_RE.match(lines[i])
        if sm:
            section = sm.group(1)
            i += 1
            continue
        rm = ROW_RE.match(lines[i])
        if not rm:
            i += 1
            continue
        summary = rm.group('summary')
        if summary == HEADER_ROW:
            i += 1
            continue
        row = {
            'section': section,
            'summary': summary,
            'title': None,
            'url': None,
            'prices': parse_price_list(summary),
            'status': infer_status(summary),
            'tier': None,
            'factory': None,
            'seller': parse_author(summary),
            'posted': parse_posted(summary),
            'is_sub_listing': '↳' in summary,
        }
        tier, factory = parse_factory(summary)
        row['tier'] = tier
        row['factory'] = factory
        j = i + 1
        while j < len(lines) and not ROW_RE.match(lines[j]) and not SECTION_RE.match(lines[j]):
            lm = LINK_RE.match(lines[j])
            if lm and row['title'] is None:
                row['title'] = lm.group('label')
                if j + 1 < len(lines):
                    um = URL_RE.match(lines[j + 1])
                    if um:
                        row['url'] = um.group('url')
            j += 1
        if row['title']:
            rows.append(row)
        i = j
    OUT.write_text(json.dumps({'rows': rows}, indent=2))
    print(json.dumps({'rows': len(rows), 'out': str(OUT)}, indent=2))
    from collections import Counter
    c = Counter(r['section'] for r in rows)
    print(json.dumps(c, indent=2))


if __name__ == '__main__':
    main()
