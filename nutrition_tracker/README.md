# Nutrition Tracker

Daily intake logger with persistent storage, per-day summaries, and a local desktop app shell.

## Targets
- Carbs: 200g
- Fat: 70g
- Protein: 150g
- Calories: 1910 kcal

## Files
- `data/nutrition.json` persistent intake database
- `data/foods_personal.json` Bobby-specific food memory and exact matches
- `data/foods_cache.json` resolved fallback cache
- `data/foods_seed.json` starter local food catalog
- `daily/YYYY-MM-DD.md` daily running log
- `server.mjs` local desktop-friendly app server
- `web/` app UI

## Food lookup order
1. personal food memory
2. cached food matches
3. seeded starter catalog
4. rough fallback estimate

## Usage
- Add intake entries by message or prompt
- System estimates calories/macros and updates the current day log
- Daily log resets automatically by date
- Start the local app with `node server.mjs` and open `http://127.0.0.1:4312`
