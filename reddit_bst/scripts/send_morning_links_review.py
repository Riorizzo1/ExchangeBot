#!/usr/bin/env python3
from pathlib import Path
import subprocess

src = Path('/Users/bobby/.openclaw/workspace/reddit_bst/data/morning_links_review.txt')
text = src.read_text()
limit = 2200
chunks = []
current = ''
for line in text.splitlines(True):
    if len(current) + len(line) > limit and current:
        chunks.append(current)
        current = line
    else:
        current += line
if current:
    chunks.append(current)

for idx, chunk in enumerate(chunks, start=1):
    msg = chunk if idx == 1 else f'(part {idx}/{len(chunks)})\n\n' + chunk
    out = subprocess.run([
        'openclaw','message','send','--channel','telegram','--target','6518392790','--message',msg,'--json'
    ], text=True, capture_output=True)
    if out.returncode != 0:
        raise SystemExit(out.stderr or out.stdout or f'failed on part {idx}')
    print(out.stdout.strip())
