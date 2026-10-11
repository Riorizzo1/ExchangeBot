#!/usr/bin/env python3
import json
from pathlib import Path

MERGED = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/dom_harvest_merged.json')
TOP150 = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/top150_current.json')
BASELINE = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/top150_previous.json')
DELTA = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/top150_delta.json')


def key(r):
    return (r.get('section'), r.get('title'), r.get('parent_title'), r.get('url'), tuple(r.get('prices', [])), r.get('seller'), r.get('posted'))


def load_rows(path):
    if not path.exists():
        return []
    obj = json.loads(path.read_text())
    if isinstance(obj, dict) and 'rows' in obj:
        return obj['rows']
    if isinstance(obj, list):
        return obj
    return []


def main():
    merged = load_rows(MERGED)
    current = merged[:150]
    TOP150.write_text(json.dumps(current, indent=2))

    previous = load_rows(BASELINE)
    prev_keys = {key(r) for r in previous}
    delta = [r for r in current if key(r) not in prev_keys]
    DELTA.write_text(json.dumps(delta, indent=2))

    print(json.dumps({
        'current_count': len(current),
        'previous_count': len(previous),
        'delta_count': len(delta),
        'current_out': str(TOP150),
        'delta_out': str(DELTA),
        'baseline_exists': BASELINE.exists(),
    }, indent=2))


if __name__ == '__main__':
    main()
