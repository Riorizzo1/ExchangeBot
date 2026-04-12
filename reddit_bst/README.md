# reddit_bst

MVP workspace for Reddit BST capture via Bobby's `List Sales` bookmarklet.

## Current approach

Reddit source access is coming from the bookmarklet output page, not direct scraping.

Workflow:
1. Run the `List Sales` bookmarklet in a logged-in Reddit session.
2. Choose page count (1 page = ~100 posts).
3. The bookmarklet opens a blob page with split listing rows and pagination.
4. Capture the blob page snapshot from the managed browser.
5. Parse those rows locally.
6. Save a clean baseline, then compute deltas on future runs.

## Files

- `repwatch_blob_page1.txt` - current captured browser snapshot of the bookmarklet blob page
- `data/current_from_blob.json` - parsed row output from the blob snapshot
- `scripts/parse_blob_snapshot.py` - parser for the snapshot text format

## Notes

- The current parser is built around the browser snapshot text structure, not raw Reddit JSON.
- It already extracts split rows with:
  - title
  - url
  - prices
  - status
  - tier
  - factory
  - seller
  - posted
  - sub-listing flag
- Next step is multi-page capture plus baseline/delta files.
