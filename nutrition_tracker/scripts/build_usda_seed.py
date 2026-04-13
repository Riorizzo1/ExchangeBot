#!/usr/bin/env python3
import csv
import io
import json
import zipfile
from pathlib import Path
from urllib.request import urlopen

URL = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-04-24.zip'
OUT = Path('/Users/bobby/.openclaw/workspace/nutrition_tracker/data/foods_seed.json')

KEYWORDS = [
    'pizza', 'spaghetti', 'meatball', 'pasta', 'burger', 'fries', 'sandwich',
    'submarine', 'sub ', 'rice', 'chicken', 'egg', 'oatmeal', 'yogurt',
    'banana', 'apple', 'salmon', 'steak', 'pretzel', 'calamari', 'cheesecake',
    'shake', 'wonton', 'dumpling', 'fried rice', 'doritos'
]

NUTRIENTS = {
    'Energy (Atwater General Factors)': 'calories',
    'Carbohydrate, by difference': 'carbs_g',
    'Total lipid (fat)': 'fat_g',
    'Protein': 'protein_g',
}


def wanted(desc: str) -> bool:
    t = (desc or '').lower()
    return any(k in t for k in KEYWORDS)


def main():
    data = urlopen(URL, timeout=120).read()
    zf = zipfile.ZipFile(io.BytesIO(data))
    food_csv = next(n for n in zf.namelist() if n.endswith('food.csv'))
    nutrient_csv = next(n for n in zf.namelist() if n.endswith('/nutrient.csv'))
    food_nutrient_csv = next(n for n in zf.namelist() if n.endswith('food_nutrient.csv'))

    nutrient_map = {}
    with zf.open(nutrient_csv) as fh:
        rows = csv.DictReader(io.TextIOWrapper(fh, encoding='utf-8'))
        for row in rows:
            nutrient_map[row['id']] = row.get('name') or ''

    foods = {}
    with zf.open(food_csv) as fh:
        rows = csv.DictReader(io.TextIOWrapper(fh, encoding='utf-8'))
        for row in rows:
            desc = row.get('description') or ''
            if not wanted(desc):
                continue
            foods[row['fdc_id']] = {
                'id': f"usda-{row['fdc_id']}",
                'name': desc.title(),
                'aliases': [],
                'serving': '100 g',
                'calories': 0,
                'carbs_g': 0,
                'fat_g': 0,
                'protein_g': 0,
                'source': 'usda-foundation',
                'confidence': 'estimate'
            }

    with zf.open(food_nutrient_csv) as fh:
        rows = csv.DictReader(io.TextIOWrapper(fh, encoding='utf-8'))
        for row in rows:
            fdc_id = row.get('fdc_id')
            if fdc_id not in foods:
                continue
            nutrient_name = nutrient_map.get(row.get('nutrient_id', ''), '')
            key = NUTRIENTS.get(nutrient_name)
            if not key:
                continue
            try:
                foods[fdc_id][key] = float(row.get('amount') or 0)
            except ValueError:
                pass

    cleaned = [item for item in foods.values() if item['calories'] > 0]
    cleaned.sort(key=lambda x: x['name'])
    OUT.write_text(json.dumps({'foods': cleaned}, indent=2))
    print(json.dumps({'count': len(cleaned), 'out': str(OUT)}, indent=2))


if __name__ == '__main__':
    main()
