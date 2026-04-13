# Nutrition Tracker

Local-first nutrition tracker with shared data between chat logging and the web/desktop app.

## Run web app

```bash
cd ~/.openclaw/workspace/nutrition_tracker
node server.mjs
```

Open:
- local machine: `http://127.0.0.1:4312`
- LAN testing: run with `HOST=0.0.0.0 node server.mjs`

## Desktop app

```bash
cd ~/.openclaw/workspace/nutrition_tracker
npm install
npm run desktop
```

This starts the local server and opens a desktop window.

## Build standalone macOS app

```bash
cd ~/.openclaw/workspace/nutrition_tracker
npm install
npm run dist
```

Expected output goes under `dist/`.

## Shared sync model

- Chat logging and app logging both write to `data/nutrition.json`
- App-created entries are tagged with source metadata
- The app polls for file updates, so chat-added entries should appear automatically
