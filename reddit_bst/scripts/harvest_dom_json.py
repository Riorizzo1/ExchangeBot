#!/usr/bin/env python3
import json
import re
import subprocess
from pathlib import Path

OUT_DIR = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/dom_harvest')
OUT_DIR.mkdir(parents=True, exist_ok=True)
MERGED_OUT = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/dom_harvest_merged.json')
STATE_OUT = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/dom_harvest_state.json')

PRICE_RE = re.compile(r'\$([\d,]+)')
TF_RE = re.compile(r'^(elite|high|mid|low)(.+)$')

DOM_EXTRACT_JS = r'''() => {
  const buttons = Array.from(document.querySelectorAll("button")).map((b, i) => ({
    i,
    text: b.innerText.trim(),
    disabled: b.disabled,
    className: b.className,
  }));
  const tables = Array.from(document.querySelectorAll("table")).map((table, ti) => ({
    tableIndex: ti,
    rows: Array.from(table.querySelectorAll("tbody tr")).map((tr, ri) => {
      const cells = Array.from(tr.querySelectorAll("td"));
      const postCell = cells[0] || null;
      const link = postCell ? postCell.querySelector("a[href]") : null;
      const imgs = postCell ? Array.from(postCell.querySelectorAll("img")).map(img => img.getAttribute("src")).filter(Boolean) : [];
      return {
        tableIndex: ti,
        rowIndex: ri,
        title: link ? link.innerText.trim() : null,
        url: link ? link.href : null,
        cells: cells.map(td => td.innerText.trim()),
        text: tr.innerText,
        imageCount: imgs.length,
      };
    })
  }));
  return {
    title: document.title,
    summaryText: document.body.innerText.slice(0, 500),
    buttons,
    tables,
  };
}'''


def eval_json(js: str):
    out = subprocess.check_output([
        'openclaw', 'browser', '--browser-profile', 'openclaw', '--json', 'evaluate', '--fn', js
    ], text=True)
    return json.loads(out)['result']


def wait(ms=1200):
    subprocess.run(['openclaw', 'browser', '--browser-profile', 'openclaw', 'wait', '--time', str(ms)], check=True)


def click_button(idx: int):
    js = f'''() => {{ const b = Array.from(document.querySelectorAll("button"))[{idx}]; if (!b) return {{ok:false, idx:{idx}}}; b.click(); return {{ok:true, idx:{idx}, text:b.innerText.trim()}}; }}'''
    return eval_json(js)


def parse_prices(price_cell: str):
    vals = []
    for m in PRICE_RE.findall(price_cell or ''):
        n = int(m.replace(',', ''))
        if n not in vals:
            vals.append(n)
    return vals


def split_tier_factory(tf: str):
    m = TF_RE.match(tf or '')
    if not m:
        return None, tf or None
    return m.group(1), m.group(2)


def normalize_row(row, section_name):
    cells = row.get('cells') or []
    if len(cells) < 6:
        return None
    tier, factory = split_tier_factory(cells[3])
    parent = None
    post_text = cells[0]
    if '\n↳ ' in post_text:
        parts = post_text.split('\n↳ ', 1)
        post_main = parts[0].strip()
        parent = parts[1].split('\n')[0].strip()
    else:
        post_main = post_text.split('\n')[0].strip()
    return {
        'section': section_name,
        'title': row.get('title') or post_main,
        'parent_title': parent,
        'url': row.get('url'),
        'prices': parse_prices(cells[1]),
        'status': cells[2],
        'tier': tier,
        'factory': factory,
        'seller': cells[4].replace('u/', ''),
        'posted': cells[5],
        'image_count': row.get('imageCount', 0),
        'table_index': row.get('tableIndex'),
        'row_index': row.get('rowIndex'),
    }


def unique_key(r):
    return (r['section'], r['title'], r.get('parent_title'), r.get('url'), tuple(r['prices']), r['seller'], r['posted'])


def load_existing():
    merged = {}
    captures = []
    if MERGED_OUT.exists():
        payload = json.loads(MERGED_OUT.read_text())
        for row in payload.get('rows', []):
            merged[unique_key(row)] = row
        captures = payload.get('captures', [])
    return merged, captures


def next_capture_index():
    nums = []
    for path in OUT_DIR.glob('capture_*.json'):
        try:
            nums.append(int(path.stem.split('_')[-1]))
        except ValueError:
            pass
    return (max(nums) + 1) if nums else 1


def choose_primary_next(buttons):
    next_buttons = [b for b in buttons if b['className'] == 'pgbtn' and b['text'] == '› Next' and not b['disabled']]
    return next_buttons[0] if next_buttons else None


def main():
    merged, captures = load_existing()
    table_names = {0: 'for_sale', 1: 'unknown', 2: 'sold'}
    start_idx = next_capture_index()
    stagnant_steps = 0

    for capture_num in range(start_idx, start_idx + 20):
        payload = eval_json(DOM_EXTRACT_JS)
        capture_path = OUT_DIR / f'capture_{capture_num:02d}.json'
        capture_path.write_text(json.dumps(payload, indent=2))

        before = len(merged)
        capture_count = 0
        for table in payload['tables']:
            section = table_names.get(table['tableIndex'], f"table_{table['tableIndex']}")
            for row in table['rows']:
                norm = normalize_row(row, section)
                if not norm:
                    continue
                merged[unique_key(norm)] = norm
                capture_count += 1
        added = len(merged) - before

        capture_entry = {
            'file': capture_path.name,
            'rows_seen': capture_count,
            'rows_added': added,
            'button_window': [b for b in payload['buttons'] if b['className'] == 'pgbtn'],
        }
        captures.append(capture_entry)
        MERGED_OUT.write_text(json.dumps({'captures': captures, 'rows': list(merged.values())}, indent=2))
        STATE_OUT.write_text(json.dumps({'last_capture': capture_path.name, 'total_rows': len(merged), 'last_rows_added': added}, indent=2))

        primary_next = choose_primary_next(payload['buttons'])
        if not primary_next:
            break
        if added == 0:
            stagnant_steps += 1
        else:
            stagnant_steps = 0
        if stagnant_steps >= 3:
            break

        click_button(primary_next['i'])
        wait()

    print(json.dumps({'captures': len(captures), 'merged_rows': len(merged), 'out': str(MERGED_OUT), 'state': str(STATE_OUT)}, indent=2))


if __name__ == '__main__':
    main()
