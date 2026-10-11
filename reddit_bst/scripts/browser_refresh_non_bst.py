#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path

ROOT = Path('/Users/bobby/.openclaw/workspace/reddit_bst')
CAPTURES = ROOT / 'captures'
CAPTURES.mkdir(exist_ok=True)
STAMP = subprocess.run(['date', '-u', '+%Y-%m-%dT%H-%M-%SZ'], capture_output=True, text=True, check=True).stdout.strip()
SUBS = [
    ('repwatchbuysell', 'parsed'),
    ('repwatchbuyselltrade', 'parsed'),
    ('watchexchangeBST', 'direct'),
    ('TheRepTimeBST', 'direct'),
]


def run(*args, json_mode=False):
    cmd = ['openclaw', 'browser', '--browser-profile', 'openclaw']
    if json_mode:
        cmd.append('--json')
    cmd.extend(args)
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout

run('start')
run('navigate', 'https://www.reddit.com/')
run('wait', '--time', '3000')

results = []
for sub, mode in SUBS:
    fn = f"""async () => {{
      try {{
        const r = await fetch('https://www.reddit.com/r/{sub}/new.json?limit=100&raw_json=1', {{credentials:'include', headers:{{Accept:'application/json'}}}});
        const text = await r.text();
        return {{ ok:r.ok, status:r.status, body:text }};
      }} catch (e) {{
        return {{ ok:false, error:String(e) }};
      }}
    }}"""
    obj = json.loads(run('evaluate', '--fn', fn, json_mode=True))
    result = obj.get('result') or {}
    raw_path = CAPTURES / f'{sub}_direct_{STAMP}.json'
    raw_path.write_text(json.dumps(result, indent=2))
    if mode == 'parsed' and result.get('body'):
        parsed_path = CAPTURES / f'{sub}_{STAMP}.json'
        subprocess.run(['python3', str(ROOT / 'scripts' / 'parse_direct_reddit_json.py'), str(raw_path), str(parsed_path)], check=True)
        results.append({'sub': sub, 'raw': str(raw_path), 'parsed': str(parsed_path), 'ok': result.get('ok'), 'status': result.get('status')})
    else:
        results.append({'sub': sub, 'raw': str(raw_path), 'ok': result.get('ok'), 'status': result.get('status'), 'error': result.get('error')})

print(json.dumps(results, indent=2))
