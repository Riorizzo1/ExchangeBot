# Watch Desk

Local static dashboard for Bobby's watch-market scans. This is an augmentation layer over the existing Reddit BST and RWI workflows; it should not replace or mutate those capture jobs.

## Purpose

At the end of the day, build one fast, click-through aggregate report from the current RWI + Reddit outputs, with local thumbnails/full images cached so Bobby can browse the watch market without reopening every source thread.

## Inputs

- RWI feed: `/Users/bobby/.openclaw/workspace/rwi_mvp/data/rwi.json`
- Reddit aggregate: `/Users/bobby/.openclaw/workspace/reddit_bst/data/aggregate_snapshot.json`
- Optional RWI image map: `watch_desk/public/data/rwi-images-YYYY-MM-DD.json`

## Outputs

Generated, not committed:

- `watch_desk/public/data/latest.json`
- `watch_desk/public/data/YYYY-MM-DD.json`
- `watch_desk/public/data/rwi-images-YYYY-MM-DD.json`
- `watch_desk/public/images/full/`
- `watch_desk/public/images/thumbs/`

Tracked app/workflow files:

- `watch_desk/scripts/build_watch_desk.py`
- `watch_desk/scripts/extract_rwi_images.mjs`
- `watch_desk/public/index.html`
- `watch_desk/public/assets/app.js`
- `watch_desk/public/assets/app.css`

## Build

```bash
cd /Users/bobby/.openclaw/workspace
python3 watch_desk/scripts/build_watch_desk.py
```

## Extract/refresh RWI images

Use this after the RWI crawl has fresh listings and before the final daily build when RWI images matter:

```bash
cd /Users/bobby/.openclaw/workspace/watch_desk
node scripts/extract_rwi_images.mjs
cd /Users/bobby/.openclaw/workspace
python3 watch_desk/scripts/build_watch_desk.py
```

## Serve locally

```bash
cd /Users/bobby/.openclaw/workspace/watch_desk/public
python3 -m http.server 8768 --bind 0.0.0.0
```

Current LAN URL observed:

```text
http://10.0.0.186:8768/
```

## Daily workflow contract

1. Let existing RWI and Reddit jobs run normally.
2. Run RWI image extraction in chunks if fresh RWI images are needed.
3. Run `build_watch_desk.py` to generate static JSON and cache thumbnails.
4. Serve/share the dashboard URL or send the end-of-day report link.
5. Do not commit generated payloads/images; commit only app/workflow changes.

## UX notes

- Default view should emphasize current inventory: for sale + pending.
- Sold/completed/unavailable should stay excluded unless intentionally included.
- Supports Aggregate / RWI / Reddit views.
- Local thumbnails and lazy rendering keep the page fast.
- Mobile optimization is a next pass; desktop currently works well.
