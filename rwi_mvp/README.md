# RWI MVP

RWI sales monitoring using the Replica Search bookmarklet logic as the source of truth.

## Current architecture
- start the managed browser and navigate to the RWI sales forum sorted by first-post descending
- run the bookmarklet-derived extractor in the managed browser
- collect structured listing rows directly from the index DOM
- save the current pull to `data/rwi.json`
- compare against `data/rwi.previous.json` for delta
- stop the managed browser after the delta run so the next run starts fresh

This replaces the older brittle thread-by-thread crawler for current/latest ordering.

## Source page
- `https://forum.replica-watch.info/forums/replica-genuine-watch-sales.9951900/?order=post_date&direction=desc`

## Commands
- `node run_bookmarklet_extractor.mjs`
- `node src/run-crawl.js`
- `node delta_compare.mjs`
- `node run_fresh_delta.mjs`
- `npm run crawl:delta`

## Files
- `rwi_bookmarklet_extractor.js` - no-UI extractor adapted from the bookmarklet
- `rwi_bookmarklet_extractor_wrapped.js` - wrapped evaluate payload
- `run_bookmarklet_extractor.mjs` - runs extraction via `openclaw browser evaluate`
- `data/rwi_bookmarklet_current.json` - raw current bookmarklet-based pull
- `data/rwi.json` - normalized current pull used by delta
- `data/rwi.previous.json` - previous normalized baseline

## Delta rules
- compare current `threadId` values against the previous baseline
- keep `FOR SALE` and `PENDING`
- exclude `SOLD`

## Fresh-browser behavior
- `run_bookmarklet_extractor.mjs` now starts the managed browser and navigates to the source page before extraction
- `run_fresh_delta.mjs` is the canonical hourly path: run crawl, run delta, then stop the managed browser in a finally block
