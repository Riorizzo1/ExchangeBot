# Watch Desk

Local static dashboard for Bobby's watch-market scans. This is an augmentation layer over the existing Reddit BST and RWI workflows; it should not replace or mutate those capture jobs.

## Purpose

Serve a fast, mobile-first **Watch Desk** for RWI and Reddit: the default
Today view surfaces the current day’s market, while All listings exposes the
normalized active inventory without shipping its galleries up front. It is
deliberately separate from the older full-inventory board, which is useful for
research but too large for the hourly dashboard path.

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

Daily Delta outputs (the normal hourly product):

- `watch_desk/public/data/daily_watch_dashboard.json` — canonical daily state
- `watch_desk/public/daily/data/manifest.json` — compact Today card list
- `watch_desk/public/daily/data/catalog.json` — compact All listings index,
  fetched only after the user switches scope
- `watch_desk/public/daily/data/listings/*.json` — gallery/detail data loaded
  only when a card is opened

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

That command builds the legacy full-inventory board. It is not part of the
hourly Daily Delta path.

## Publish Daily Delta

```bash
cd /Users/bobby/.openclaw/workspace
zsh watch_desk/scripts/refresh_daily_dashboard.sh reddit rwi
```

The source hourly jobs call this with their own source after a successful
crawl, and `com.bobby.watch-desk-refresh` reconciles both sources every 20
minutes. The publisher folds only validated deltas, writes the small manifest,
and uses a lock to prevent overlapping publishes. The root dashboard URL
redirects to `/daily/`; the legacy full board remains at `/v2.html`.

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
python3 -m http.server 4314 --bind 0.0.0.0
```

Current LAN URL observed:

```text
http://10.0.0.186:4314/
```

## Daily workflow contract

1. Let the existing RWI and Reddit jobs produce their validated deltas.
2. Fold each source into the canonical daily state and publish `/daily/`.
3. Never put the complete `latest.json` catalog or its galleries in the Daily
   Delta client payload.
4. Do historical image recovery only as an explicit maintenance task, never in
   an hourly job.
5. Do not commit generated payloads/images; commit only app/workflow changes.

## UX notes

- Default view emphasizes active inventory: for sale + pending.
- Today and All listings support source/status/community/brand/factory/region/
  price filters, saved searches, shortlists, and cross-post grouping.
- 30 cards are rendered initially and more load on demand.
- Galleries load only inside the listing drawer.
- The layout is responsive from phone width through desktop.
