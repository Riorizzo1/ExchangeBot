#!/usr/bin/env python3
import json
import re
from pathlib import Path

SRC = Path('/Users/bobby/.openclaw/workspace/reddit_bst/repwatch_blob_page1.txt')
OUT = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/current_from_blob.json')

ROW_RE = re.compile(r"^\s*- row\s+\"(?P<summary>.*)\":\s*$")
LINK_RE = re.compile(r'^\s*- link\s+\"(?P<label>.*?)\"(?:\s+\[ref=.*?\])?:\s*$')
URL_RE = re.compile(r'^\s*- /url:\s+(?P<url>\S+)\s*$')
PAGE_RE = re.compile(r'Page\s+(\d+)\s+of\s+(\d+)')
COUNT_RE = re.compile(r'text:\s+(\d+) listings shown')
SUB_RE = re.compile(r'paragraph:\s+r/([^\s·]+)\s+·\s+(\d+) for sale\s+·\s+(\d+) pending\s+·\s+(\d+) sold\s+·\s+(\d+) unknown')
HEADER_ROW = 'Post / Photos Price Status Factory Seller Posted'
SOLD_HEADER_ROW = 'Post / Photos Price Status Factory Seller Posted'


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
    rows = []
    meta = {}
    i = 0
    while i < len(lines):
        line = lines[i]
        if 'listings shown' in line:
            m = COUNT_RE.search(line)
            if m:
                meta['shown'] = int(m.group(1))
        if 'paragraph: r/' in line:
            m = SUB_RE.search(line)
            if m:
                meta['subreddit'] = m.group(1)
                meta['for_sale'] = int(m.group(2))
                meta['pending'] = int(m.group(3))
                meta['sold'] = int(m.group(4))
                meta['unknown'] = int(m.group(5))
        if 'Page ' in line and ' of ' in line:
            m = PAGE_RE.search(line)
            if m:
                meta['page'] = int(m.group(1))
                meta['pages_total'] = int(m.group(2))
        m = ROW_RE.match(line)
        if not m:
            i += 1
            continue
        summary = m.group('summary')
        if summary in (HEADER_ROW, SOLD_HEADER_ROW):
            i += 1
            continue
        row = {
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
        while j < len(lines) and not ROW_RE.match(lines[j]):
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
    OUT.write_text(json.dumps({'meta': meta, 'rows': rows}, indent=2))
    print(json.dumps({'meta': meta, 'rowsParsed': len(rows), 'out': str(OUT)}, indent=2))


if __name__ == '__main__':
    main()
