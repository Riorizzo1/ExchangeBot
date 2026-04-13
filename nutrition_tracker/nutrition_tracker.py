#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import hashlib
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any

from PIL import Image, ImageDraw, ImageFont

BASE = Path('/Users/bobby/.openclaw/workspace/nutrition_tracker')
DATA = BASE / 'data'
DAILY = BASE / 'daily'
DB = DATA / 'nutrition.json'
PENDING = DATA / 'pending.json'
FOODS_PERSONAL = DATA / 'foods_personal.json'
FOODS_CACHE = DATA / 'foods_cache.json'
FOODS_SEED = DATA / 'foods_seed.json'
RENDERED = BASE / 'renders'

CAL_TARGETS = {'carbs_g': 200, 'fat_g': 70, 'protein_g': 150}
CAL_TARGETS['calories'] = CAL_TARGETS['carbs_g'] * 4 + CAL_TARGETS['protein_g'] * 4 + CAL_TARGETS['fat_g'] * 9

COMMON = {
    'egg': {'calories': 72, 'protein_g': 6.3, 'fat_g': 4.8, 'carbs_g': 0.4},
    'eggs': {'calories': 72, 'protein_g': 6.3, 'fat_g': 4.8, 'carbs_g': 0.4},
    'chicken breast': {'calories': 165, 'protein_g': 31, 'fat_g': 3.6, 'carbs_g': 0},
    'rice': {'calories': 206, 'protein_g': 4.3, 'fat_g': 0.4, 'carbs_g': 45},
    'white rice': {'calories': 206, 'protein_g': 4.3, 'fat_g': 0.4, 'carbs_g': 45},
    'banana': {'calories': 105, 'protein_g': 1.3, 'fat_g': 0.4, 'carbs_g': 27},
    'protein shake': {'calories': 120, 'protein_g': 24, 'fat_g': 2, 'carbs_g': 3},
    'greek yogurt': {'calories': 100, 'protein_g': 17, 'fat_g': 0, 'carbs_g': 6},
    'yogurt': {'calories': 100, 'protein_g': 17, 'fat_g': 0, 'carbs_g': 6},
    'oatmeal': {'calories': 150, 'protein_g': 5, 'fat_g': 3, 'carbs_g': 27},
    'apple': {'calories': 95, 'protein_g': 0.5, 'fat_g': 0.3, 'carbs_g': 25},
    'salmon': {'calories': 208, 'protein_g': 22, 'fat_g': 13, 'carbs_g': 0},
    'avocado': {'calories': 240, 'protein_g': 3, 'fat_g': 22, 'carbs_g': 12},
}


def load_foods_file(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    try:
        obj = json.loads(path.read_text(encoding='utf8'))
    except Exception:
        return []
    return obj.get('foods', []) if isinstance(obj, dict) else []


def match_food_memory(text: str) -> Dict[str, float] | None:
    t = text.lower()
    all_foods = load_foods_file(FOODS_PERSONAL) + load_foods_file(FOODS_CACHE) + load_foods_file(FOODS_SEED)
    best = None
    best_score = 0
    for item in all_foods:
        names = [item.get('name', '')] + list(item.get('aliases', []))
        score = 0
        for name in names:
            n = name.lower().strip()
            if not n:
                continue
            if n in t:
                score = max(score, len(n))
        if score > best_score:
            best = item
            best_score = score
    if not best:
        return None
    qty = 1.0
    if '2 slices' in t and 'slice' in (best.get('serving', '') + ' ' + best.get('name', '')).lower():
        qty = 2.0
    elif 'half' in t and 'half' in best.get('serving', '').lower():
        qty = 1.0
    return {
        'calories': float(best.get('calories', 0)) * qty,
        'carbs_g': float(best.get('carbs_g', 0)) * qty,
        'fat_g': float(best.get('fat_g', 0)) * qty,
        'protein_g': float(best.get('protein_g', 0)) * qty,
    }

@dataclass
class Entry:
    timestamp: str
    text: str
    calories: float
    carbs_g: float
    fat_g: float
    protein_g: float


def ensure():
    DATA.mkdir(parents=True, exist_ok=True)
    DAILY.mkdir(parents=True, exist_ok=True)
    RENDERED.mkdir(parents=True, exist_ok=True)
    if not DB.exists():
        DB.write_text(json.dumps({'days': {}}, indent=2), encoding='utf8')
    if not PENDING.exists():
        PENDING.write_text(json.dumps({}, indent=2), encoding='utf8')


def today_key():
    return datetime.now().astimezone().strftime('%Y-%m-%d')


def today_stamp():
    return datetime.now().astimezone().strftime('%Y-%m-%d %H:%M')


def load_db():
    ensure()
    return json.loads(DB.read_text(encoding='utf8'))


def save_db(db):
    DB.write_text(json.dumps(db, indent=2, ensure_ascii=False), encoding='utf8')


def load_pending():
    ensure()
    return json.loads(PENDING.read_text(encoding='utf8'))


def save_pending(pending):
    PENDING.write_text(json.dumps(pending, indent=2, ensure_ascii=False), encoding='utf8')


def estimate(text: str) -> Dict[str, float]:
    memory_match = match_food_memory(text)
    if memory_match:
        return memory_match
    t = text.lower()
    totals = {'calories': 0.0, 'carbs_g': 0.0, 'fat_g': 0.0, 'protein_g': 0.0}
    matched = False
    for name, vals in COMMON.items():
        if name in t:
            matched = True
            for k in totals:
                totals[k] += vals[k]
    nums = re.findall(r'(\d+(?:\.\d+)?)\s*(g|gram|grams|oz|ounce|ounces|cup|cups|tbsp|tablespoon|tbsp\.|slice|slices|piece|pieces|serving|servings)?', t)
    if nums and not matched:
        qty = float(nums[0][0])
        totals['calories'] += qty * 100
        totals['carbs_g'] += qty * 10
        totals['fat_g'] += qty * 3
        totals['protein_g'] += qty * 5
    if not matched and not nums:
        exact = COMMON.get(t.strip())
        if exact:
            return {k: float(v) for k, v in exact.items()}
    return totals


def bar(current, target, width=20):
    ratio = min(max(current / target if target else 0, 0), 1)
    filled = round(ratio * width)
    return '█' * filled + '░' * (width - filled)


def format_day(day: Dict[str, Any]) -> str:
    e = day.get('entries', [])
    totals = day.get('totals', {'calories': 0, 'carbs_g': 0, 'fat_g': 0, 'protein_g': 0})
    remaining = {
        'carbs_g': CAL_TARGETS['carbs_g'] - totals.get('carbs_g', 0),
        'fat_g': CAL_TARGETS['fat_g'] - totals.get('fat_g', 0),
        'protein_g': CAL_TARGETS['protein_g'] - totals.get('protein_g', 0),
        'calories': CAL_TARGETS['calories'] - totals.get('calories', 0),
    }
    out = []
    out.append(f"📅 Daily log")
    out.append(f"🎯 Targets: {CAL_TARGETS['calories']} kcal | C {CAL_TARGETS['carbs_g']}g | F {CAL_TARGETS['fat_g']}g | P {CAL_TARGETS['protein_g']}g")
    out.append(f"✅ Used: {totals.get('calories',0):.0f} kcal | C {totals.get('carbs_g',0):.1f}g | F {totals.get('fat_g',0):.1f}g | P {totals.get('protein_g',0):.1f}g")
    out.append(f"⏳ Left: {remaining['calories']:.0f} kcal | C {remaining['carbs_g']:.1f}g | F {remaining['fat_g']:.1f}g | P {remaining['protein_g']:.1f}g")
    out.append(f"🍞 Carbs   [{bar(totals.get('carbs_g',0), CAL_TARGETS['carbs_g'])}] {totals.get('carbs_g',0):.1f}/{CAL_TARGETS['carbs_g']}g")
    out.append(f"🧈 Fat     [{bar(totals.get('fat_g',0), CAL_TARGETS['fat_g'])}] {totals.get('fat_g',0):.1f}/{CAL_TARGETS['fat_g']}g")
    out.append(f"🥩 Protein [{bar(totals.get('protein_g',0), CAL_TARGETS['protein_g'])}] {totals.get('protein_g',0):.1f}/{CAL_TARGETS['protein_g']}g")
    out.append('🧾 Entries:')
    for idx, item in enumerate(e, 1):
        out.append(f"{idx}. {item['timestamp']} | {item['text']} -> {item['calories']:.0f} kcal, C {item['carbs_g']:.1f}, F {item['fat_g']:.1f}, P {item['protein_g']:.1f}")
    return '\n'.join(out)


def summary_metrics(day: Dict[str, Any]) -> Dict[str, Any]:
    totals = day.get('totals', {'calories': 0, 'carbs_g': 0, 'fat_g': 0, 'protein_g': 0})
    return {
        'totals': totals,
        'remaining': {
            'calories': CAL_TARGETS['calories'] - totals.get('calories', 0),
            'carbs_g': CAL_TARGETS['carbs_g'] - totals.get('carbs_g', 0),
            'fat_g': CAL_TARGETS['fat_g'] - totals.get('fat_g', 0),
            'protein_g': CAL_TARGETS['protein_g'] - totals.get('protein_g', 0),
        },
    }


def render_day_image(day_key: str, day: Dict[str, Any]) -> Path:
    img = Image.new('RGB', (1100, 1500), 'white')
    d = ImageDraw.Draw(img)
    title_font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 40)
    body_font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
    small_font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)

    m = summary_metrics(day)
    t = m['totals']
    r = m['remaining']

    d.text((40, 30), f"Nutrition log, {day_key}", fill='black', font=title_font)
    d.text((40, 95), f"Targets: {CAL_TARGETS['calories']} kcal | C {CAL_TARGETS['carbs_g']}g | F {CAL_TARGETS['fat_g']}g | P {CAL_TARGETS['protein_g']}g", fill='black', font=body_font)
    d.text((40, 135), f"Used: {t.get('calories',0):.0f} kcal | C {t.get('carbs_g',0):.1f}g | F {t.get('fat_g',0):.1f}g | P {t.get('protein_g',0):.1f}g", fill='black', font=body_font)
    d.text((40, 175), f"Left: {r['calories']:.0f} kcal | C {r['carbs_g']:.1f}g | F {r['fat_g']:.1f}g | P {r['protein_g']:.1f}g", fill='black', font=body_font)

    y = 235
    for label, used, target in [('Carbs', t.get('carbs_g',0), CAL_TARGETS['carbs_g']), ('Fat', t.get('fat_g',0), CAL_TARGETS['fat_g']), ('Protein', t.get('protein_g',0), CAL_TARGETS['protein_g'])]:
        d.text((40, y), f"{label}", fill='black', font=body_font)
        ratio = min(max(used / target if target else 0, 0), 1)
        bar_w = 720
        filled = int(bar_w * ratio)
        d.rectangle((150, y + 6, 150 + bar_w, y + 28), outline='black', width=2)
        d.rectangle((150, y + 6, 150 + filled, y + 28), fill='black')
        d.text((900, y), f"{used:.1f}/{target}g", fill='black', font=body_font)
        y += 55

    d.text((40, 410), 'Journal entries', fill='black', font=title_font)
    y = 470
    for idx, item in enumerate(day.get('entries', []), 1):
        block = f"{idx}. {item['timestamp']}\n{item['text']}\n{item['calories']:.0f} kcal | C {item['carbs_g']:.1f} | F {item['fat_g']:.1f} | P {item['protein_g']:.1f}"
        d.multiline_text((40, y), block, fill='black', font=small_font, spacing=4)
        y += 95
        if y > 1450:
            break

    path = RENDERED / f'{day_key}.jpg'
    img.save(path, quality=92)
    return path


def add(text: str) -> str:
    db = load_db()
    day = today_key()
    db['days'].setdefault(day, {'entries': [], 'totals': {'calories': 0.0, 'carbs_g': 0.0, 'fat_g': 0.0, 'protein_g': 0.0}})
    est = estimate(text)
    entry = Entry(today_stamp(), text, **est)
    db['days'][day]['entries'].append(asdict(entry))
    for k in db['days'][day]['totals']:
        db['days'][day]['totals'][k] += est[k]
    save_db(db)
    dayfile = DAILY / f'{day}.md'
    dayfile.write_text(format_day(db['days'][day]) + '\n', encoding='utf8')
    render_day_image(day, db['days'][day])
    return format_day(db['days'][day])


def propose(text: str) -> str:
    est = estimate(text)
    pending = load_pending()
    token = hashlib.sha1((today_stamp() + '|' + text).encode('utf8')).hexdigest()[:8]
    pending[token] = {'timestamp': today_stamp(), 'text': text, 'est': est}
    save_pending(pending)
    return (
        f"Estimate pending [{token}]\n"
        f"Text: {text}\n"
        f"Calories: {est['calories']:.0f} | C {est['carbs_g']:.1f}g | F {est['fat_g']:.1f}g | P {est['protein_g']:.1f}g\n"
        f"Reply confirm {token} to log it."
    )


def confirm(token: str) -> str:
    pending = load_pending()
    item = pending.pop(token, None)
    if not item:
        return f'No pending entry for {token}'
    save_pending(pending)
    db = load_db()
    day = today_key()
    db['days'].setdefault(day, {'entries': [], 'totals': {'calories': 0.0, 'carbs_g': 0.0, 'fat_g': 0.0, 'protein_g': 0.0}})
    entry = Entry(item['timestamp'], item['text'], **item['est'])
    db['days'][day]['entries'].append(asdict(entry))
    for k in db['days'][day]['totals']:
        db['days'][day]['totals'][k] += item['est'][k]
    save_db(db)
    DAILY.joinpath(f'{day}.md').write_text(format_day(db['days'][day]) + '\n', encoding='utf8')
    render_day_image(day, db['days'][day])
    return format_day(db['days'][day])


def confirm_item(token: str, calories: float, carbs: float, fat: float, protein: float) -> str:
    pending = load_pending()
    item = pending.pop(token, None)
    if not item:
        return f'No pending entry for {token}'
    est = {'calories': float(calories), 'carbs_g': float(carbs), 'fat_g': float(fat), 'protein_g': float(protein)}
    save_pending(pending)
    db = load_db()
    day = today_key()
    db['days'].setdefault(day, {'entries': [], 'totals': {'calories': 0.0, 'carbs_g': 0.0, 'fat_g': 0.0, 'protein_g': 0.0}})
    entry = Entry(item['timestamp'], item['text'], **est)
    db['days'][day]['entries'].append(asdict(entry))
    for k in db['days'][day]['totals']:
        db['days'][day]['totals'][k] += est[k]
    save_db(db)
    DAILY.joinpath(f'{day}.md').write_text(format_day(db['days'][day]) + '\n', encoding='utf8')
    render_day_image(day, db['days'][day])
    return format_day(db['days'][day])


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print('usage: nutrition_tracker.py propose|confirm|add "food description"')
        raise SystemExit(1)
    cmd = sys.argv[1]
    if cmd == 'add':
        print(add(' '.join(sys.argv[2:])))
    elif cmd == 'propose':
        print(propose(' '.join(sys.argv[2:])))
    elif cmd == 'confirm':
        print(confirm(sys.argv[2]))
    elif cmd == 'confirm-item':
        print(confirm_item(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6]))
    else:
        raise SystemExit(f'unknown command {cmd}')
