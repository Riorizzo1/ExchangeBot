# reddit_bst

Reddit BST capture workspace.

## Normal aggregate scan workflow

This workspace now supports a mixed capture strategy across the currently useful BST subreddits.

Included subreddits:
- `r/BSTRepWatch` (existing blob/bookmarklet snapshot flow)
- `r/repwatchbuysell` (bookmarklet flow)
- `r/repwatchbuyselltrade` (bookmarklet flow)
- `r/WatchExchangeBST` (direct authenticated browser JSON pull)
- `r/TheRepTimeBST` (direct authenticated browser JSON pull)

Why mixed mode:
- Some subreddits work reliably with the `List Sales` bookmarklet and split sub-listing output.
- Some subreddits are more stable via direct authenticated `new.json` fetches from the managed Reddit browser session.

## Scripts

- `run_all_subreddit_scans.mjs`
  - runs the aggregate scan across the supported subreddits
  - uses bookmarklet mode where it works best
  - uses direct browser JSON mode where page/browser wait flow is flaky
- `run_multi_subreddit_capture.mjs`
  - older bookmarklet-focused multi-subreddit runner
- `run_direct_browser_json_pull.mjs <subreddit> [limit]`
  - direct authenticated browser fetch for one subreddit
- `scripts/parse_direct_reddit_json.py`
  - parses direct browser JSON captures into normalized rows
- `scripts/build_aggregate_today_summary.py <label=file> ...`
  - builds today-active summaries split into watches vs accessories
- `scripts/parse_blob_snapshot.py`
  - parser for the legacy BSTRepWatch blob snapshot text format

## Business rules

- Treat listings under `$170` as accessory / bracelet / side-item by default, not full watch listings.
- Today-active reports should keep `available` and `pending`, and drop sold items.
- Large Telegram outputs should be chunked.

## Files

- `captures/` - saved raw capture outputs from aggregate scans
- `repwatch_blob_page1.txt` - current captured browser snapshot of the BSTRepWatch blob page
- `data/current_from_blob.json` - parsed row output from the BSTRepWatch blob snapshot

## Notes

- Bookmarklet captures preserve richer split listing rows for multi-item posts.
- Direct browser JSON pulls are the fallback when Reddit/browser timing makes the bookmarklet flow unreliable.
- If a subreddit starts failing in bookmarklet mode, prefer moving it into the direct browser JSON path instead of fighting the gateway.
