# Watch Desk Live Dashboard Contract

Purpose: make Watch Desk the live visual front-end for the Reddit/RWI delta process.

## Inputs

Primary delta input:
- `/Users/bobby/.openclaw/workspace/reddit_bst/data/aggregate_snapshot.json`

Supporting image/data inputs:
- `/Users/bobby/.openclaw/workspace/reddit_bst/data/aggregate_current.json`
- `/Users/bobby/.openclaw/workspace/watch_desk/public/data/reddit-images-YYYY-MM-DD.json`
- `/Users/bobby/.openclaw/workspace/rwi_mvp/data/rwi.json`
- `/Users/bobby/.openclaw/workspace/watch_desk/public/data/rwi-images-YYYY-MM-DD.json`

## Build command

```bash
/Users/bobby/.openclaw/workspace/watch_desk/scripts/update_live_dashboard.sh
```

## Outputs

- `/Users/bobby/.openclaw/workspace/watch_desk/public/data/latest.json`
- `/Users/bobby/.openclaw/workspace/watch_desk/public/data/YYYY-MM-DD.json`
- `/Users/bobby/.openclaw/workspace/watch_desk/public/v2.html`

## URL

- LAN: `http://10.0.0.186:4314/v2.html`
- Local: `http://127.0.0.1:4314/v2.html`

## Integration point

After `reddit_bst/scripts/build_reddit_aggregate_delta.py` completes successfully, run `watch_desk/scripts/update_live_dashboard.sh`.

Do not block the delta Telegram summary on dashboard build failure initially; log the failure and keep the delta notification path alive. Once stable, dashboard failure can become alert-worthy.

## Product behavior

- Dashboard should always represent the current day/current aggregate state.
- Bulk Reddit posts should render as one grouped bulk card, not many fake item/photo matches.
- Bulk detail drawer should show the full gallery plus the parsed item list.
- Missing seller/image/price should be displayed as explicit fallback text, not broken-looking blank space.
