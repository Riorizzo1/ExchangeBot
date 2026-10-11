#!/usr/bin/env python3
import ast
import json
import re
import subprocess
from pathlib import Path

BASE = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/harvest_for_sale')
BASE.mkdir(parents=True, exist_ok=True)
MERGED = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/harvest_for_sale_merged.json')

META_RE = re.compile(r'^\t(?P<prices>\$[\d,]+(?:, \$[\d,]+)*)\t(?P<status>For Sale|Pending|Sold|Unknown)\t(?P<tierfactory>[^\t]+)\tu/(?P<seller>[^\t]+)\t(?P<posted>.+)$')
PAGE_INFO_RE = re.compile(r'Page\s+(\d+)\s+of\s+(\d+)\s+·\s+25 per page')
SKIP_LINES = {'RepWatch','Newest first','Price: low → high','Price: high → low','Factory tier','Status','All','For Sale','Pending','Sold','Price','All prices','Under $200','$200–400','$400–600','$600–1000','$1000+','Time','All time','Last hour','Last 24h','3 days','7 days'}


def run_eval(js: str):
    out = subprocess.check_output(['openclaw','browser','--browser-profile','openclaw','--json','evaluate','--fn',js], text=True)
    return json.loads(out)['result']


def run_wait(ms: int = 1200):
    subprocess.run(['openclaw','browser','--browser-profile','openclaw','wait','--time',str(ms)], check=True)


def click_button(idx: int):
    js = f'''() => {{ const b = Array.from(document.querySelectorAll("button"))[{idx}]; if (!b) return {{ok:false, idx:{idx}}}; b.click(); return {{ok:true, idx:{idx}, text:b.innerText.trim()}}; }}'''
    return run_eval(js)


def dump_text(path: Path):
    out = run_eval('() => document.body.innerText')
    path.write_text(json.dumps(out))


def load_payload(path: Path) -> str:
    return json.loads(path.read_text())


def split_tf(s):
    m = re.match(r'(elite|high|mid|low)(.+)$', s)
    return (m.group(1), m.group(2)) if m else (None, s)


def parse_rows(text: str):
    lines = text.splitlines()
    rows = []
    page_infos = []
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        m = PAGE_INFO_RE.search(stripped)
        if m:
            page_infos.append({'page': int(m.group(1)), 'total': int(m.group(2)), 'line': stripped})
        if not stripped or stripped in SKIP_LINES or stripped.startswith('r/') or 'listings shown' in stripped or stripped.startswith('For Sale (') or stripped.startswith('Pending (') or stripped.startswith('Unknown Status (') or stripped.startswith('Sold / Traded (') or stripped.startswith('Page '):
            i += 1
            continue
        parent = None
        j = i + 1
        if j < len(lines) and lines[j].strip().startswith('↳ '):
            parent = lines[j].strip()[2:].strip()
            j += 1
        if j < len(lines) and lines[j].strip().startswith('+'):
            j += 1
        if j < len(lines) and META_RE.match(lines[j]):
            m = META_RE.match(lines[j])
            tier, factory = split_tf(m.group('tierfactory'))
            rows.append({
                'title': stripped,
                'parent_title': parent,
                'prices': [int(x.replace(',','')) for x in re.findall(r'\$([\d,]+)', m.group('prices'))],
                'status': m.group('status'),
                'tier': tier,
                'factory': factory,
                'seller': m.group('seller'),
                'posted': m.group('posted'),
            })
            i = j + 1
            continue
        i += 1
    return rows, page_infos


def unique_key(r):
    return (r['title'], r.get('parent_title'), tuple(r['prices']), r['seller'], r['posted'])


def button_state():
    return run_eval('() => Array.from(document.querySelectorAll("button")).map((b,i)=>({i,text:b.innerText.trim(),disabled:b.disabled,className:b.className}))')


def main():
    captures = []
    merged = {}

    # Start from current first pager window position and advance with the first Next button.
    for step in range(10):
        path = BASE / f'capture_{step+1:02d}.json'
        dump_text(path)
        text = load_payload(path)
        rows, page_infos = parse_rows(text)
        for r in rows:
            merged[unique_key(r)] = r
        state = button_state()
        captures.append({'file': path.name, 'rows': len(rows), 'pageInfos': page_infos, 'buttons': state})
        next_candidates = [b for b in state if b['className'] == 'pgbtn' and b['text'] == '› Next' and not b['disabled']]
        if not next_candidates:
            break
        idx = next_candidates[0]['i']
        print(click_button(idx))
        run_wait()

    MERGED.write_text(json.dumps({'captures': captures, 'rows': list(merged.values())}, indent=2))
    print(json.dumps({'captures': len(captures), 'merged_rows': len(merged), 'out': str(MERGED)}, indent=2))


if __name__ == '__main__':
    main()
