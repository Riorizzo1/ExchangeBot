#!/usr/bin/env python3
import json
from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'data' / 'tickers.json'
data = json.loads(p.read_text())
for t, info in sorted(data.items(), key=lambda kv: kv[1].get('score', 0), reverse=True)[:12]:
    print(t, info['score'], 'mentions', info['mentions'], 'sources', info['distinct_sources'], 'nov', info.get('novelty_bonus'), 'rare', info.get('rarity_bonus'), 'rep', info.get('recurring_penalty'), 'prev', info.get('previous_mentions'), 'avg', info.get('average_recent_mentions'))
print('--- emerging ---')
for t, info in [kv for kv in sorted(data.items(), key=lambda kv: kv[1].get('score', 0), reverse=True) if kv[1].get('rarity_bonus', 0) > 0][:10]:
    print(t, info['score'], 'mentions', info['mentions'], 'sources', info['distinct_sources'])
