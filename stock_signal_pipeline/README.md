# Stock Signal Pipeline

Low-token finance article discovery and recommendation workflow.

## Design

- search-first discovery
- lightweight metadata capture
- ticker aggregation
- daily summary output
- Friday recommendation synthesis

## Current scaffold

Scripts:

- `scripts/run_search_ingest.py`
- `scripts/build_daily_report.py`
- `scripts/build_weekly_recommendations.py`

## Intended schedule

- morning ingest
- evening ingest
- end-of-day daily snapshot
- Friday night weekly recommendations

## Notes

The current ingest scaffold is set up for a search-driven pipeline and local scoring.
The next wiring step is connecting search results from the preferred retrieval path into the ingest script.
