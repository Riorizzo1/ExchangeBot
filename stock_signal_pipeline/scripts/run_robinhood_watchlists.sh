#!/usr/bin/env bash
set -euo pipefail

# Orchestrator: runs main + supplementary Robinhood watchlists in sequence.
# 1. Main list  (DATE supplementary)  — primary + mega-cap candidates
# 2. Supplementary list (DATE supplementary) — raw Yahoo discovery primary-lane + not-enriched

ROOT="/Users/bobby/.openclaw/workspace/stock_signal_pipeline"
SCRIPTS="$ROOT/scripts"
LIST_DATE="${LIST_DATE:-$(TZ=America/New_York date +%F)}"
LIMIT="${LIMIT:-30}"

echo "=== Robinhood dual-list workflow: $LIST_DATE ==="

# --- Step 1: Main list ---
echo ""
echo "=== Step 1: Main list ==="
MAIN_TICKERS=$(python3 "$SCRIPTS/extract_robinhood_watchlist_tickers.py" --main --limit "$LIMIT")
echo "Main tickers: $MAIN_TICKERS"
if [[ -n "${MAIN_TICKERS// }" ]]; then
    LIST_DATE="$LIST_DATE" TICKERS="$MAIN_TICKERS" LIMIT="$LIMIT" bash "$SCRIPTS/update_robinhood_watchlist.sh"
else
    echo "No main tickers; skipping."
fi

# --- Step 2: Supplementary list ---
echo ""
echo "=== Step 2: Supplementary list ==="
# Pass main tickers as --exclude so supplementary list doesn't duplicate them
SUPP_TICKERS=$(python3 "$SCRIPTS/extract_robinhood_watchlist_tickers.py" --supplementary --limit "$LIMIT" --exclude "$MAIN_TICKERS")
echo "Supplementary tickers: $SUPP_TICKERS"
if [[ -n "${SUPP_TICKERS// }" ]]; then
    LIST_DATE="$LIST_DATE" TICKERS="$SUPP_TICKERS" LIMIT="$LIMIT" bash "$SCRIPTS/update_robinhood_supplementary.sh"
else
    echo "No supplementary tickers; skipping."
fi

echo ""
echo "=== Robinhood dual-list workflow complete: $LIST_DATE ==="