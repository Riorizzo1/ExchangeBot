#!/usr/bin/env python3
import json
import sys
from pathlib import Path

from harvest_dom_json import eval_json, wait, click_button, DOM_EXTRACT_JS, normalize_row, unique_key, MERGED_OUT, STATE_OUT, OUT_DIR


def button_state():
    return eval_json('() => Array.from(document.querySelectorAll("button")).map((b,i)=>({i,text:b.innerText.trim(),disabled:b.disabled,className:b.className}))')


def rewind_top_pager(max_steps=50):
    steps = []
    for _ in range(max_steps):
        buttons = button_state()
        top_prev = next((b for b in buttons if b['i'] == 15), None)
        if not top_prev or top_prev['disabled']:
            break
        steps.append(click_button(15))
        wait(900)
    return steps, button_state()


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


def harvest_forward(max_steps=15):
    merged, captures = load_existing()
    table_names = {0: 'for_sale', 1: 'unknown', 2: 'sold'}
    start_idx = next_capture_index()
    added_log = []

    for capture_num in range(start_idx, start_idx + max_steps):
        payload = eval_json(DOM_EXTRACT_JS)
        capture_path = OUT_DIR / f'capture_{capture_num:02d}.json'
        capture_path.write_text(json.dumps(payload, indent=2))

        before = len(merged)
        seen = 0
        for table in payload['tables']:
            section = table_names.get(table['tableIndex'], f"table_{table['tableIndex']}")
            for row in table['rows']:
                norm = normalize_row(row, section)
                if not norm:
                    continue
                merged[unique_key(norm)] = norm
                seen += 1
        added = len(merged) - before
        added_log.append({'file': capture_path.name, 'seen': seen, 'added': added})
        captures.append({'file': capture_path.name, 'rows_seen': seen, 'rows_added': added, 'button_window': [b for b in payload['buttons'] if b['className'] == 'pgbtn']})
        MERGED_OUT.write_text(json.dumps({'captures': captures, 'rows': list(merged.values())}, indent=2))
        STATE_OUT.write_text(json.dumps({'last_capture': capture_path.name, 'total_rows': len(merged), 'last_rows_added': added}, indent=2))

        next_buttons = [b for b in payload['buttons'] if b['className'] == 'pgbtn' and b['text'] == '› Next' and not b['disabled']]
        if not next_buttons:
            break
        click_button(next_buttons[0]['i'])
        wait(900)

    return {'captures_total': len(captures), 'rows_total': len(merged), 'added_log': added_log}


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'both'
    steps = int(sys.argv[2]) if len(sys.argv) > 2 else 5

    output = {'mode': mode, 'steps': steps}

    if mode in {'rewind', 'both'}:
        rewind_log, final_buttons = rewind_top_pager(max_steps=steps)
        output['rewind_steps'] = len(rewind_log)
        output['final_buttons'] = final_buttons

    if mode in {'harvest', 'both'}:
        result = harvest_forward(max_steps=steps)
        output['harvest'] = result

    print(json.dumps(output, indent=2))


if __name__ == '__main__':
    main()
