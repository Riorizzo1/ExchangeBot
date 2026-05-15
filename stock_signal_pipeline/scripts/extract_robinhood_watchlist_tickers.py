#!/usr/bin/env python3
"""Extract ticker sets for Robinhood watchlist creation.

Output modes (mutually exclusive):
  --main        Primary candidates + mega-cap context (existing behavior)
  --supplementary  Raw Yahoo discovery tickers: primary lane + not-enriched
                  from the discovery section (excludes mega context, non-equity)

Usage:
  python3 extract_robinhood_watchlist_tickers.py --main --limit 30
  python3 extract_robinhood_watchlist_tickers.py --supplementary --limit 30
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import re
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
DEFAULT_LIMIT = 30


def et_today() -> str:
    return dt.datetime.now(ZoneInfo("America/New_York")).date().isoformat()


def latest_nightly_report() -> Path | None:
    files = [p for p in REPORTS.glob("nightly-*.md") if not p.name.startswith("nightly-sent-")]
    files = sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)
    return files[0] if files else None


def ranked_markdown_tickers(path: Path | None) -> list[str]:
    if not path or not path.exists():
        return []
    text = path.read_text(errors="replace")
    return re.findall(r"^##\s+\d+\.\s+([A-Z][A-Z0-9.\-]{0,6})\b", text, re.M)


def dashboard_board_tickers(path: Path) -> list[str]:
    """Extract tickers from the primary recommendation candidates section."""
    if not path.exists():
        return []
    text = path.read_text(errors="replace")
    start = text.find("Primary recommendation candidates")
    if start < 0:
        start = 0
    end_candidates = [len(text)]
    for marker in ("Source health", "</body>"):
        idx = text.find(marker, start + 1)
        if idx >= 0:
            end_candidates.append(idx)
    segment = text[start : min(end_candidates)]
    return [html.unescape(x) for x in re.findall(r'<div class="ticker">([^<]+)</div>', segment)]


def discovery_tickers(path: Path) -> dict[str, str]:
    """Extract ticker -> lane mapping from the raw Yahoo discovery section."""
    if not path.exists():
        return {}
    text = path.read_text(errors="replace")
    start = text.find("Raw Yahoo trending discovery feed")
    if start < 0:
        return {}
    end = text.find("</section>", start)
    section = text[start:end]
    # Each entry: <div class="src"><b>#N SYMBOL ...</b><span>lane</span>...
    blocks = re.findall(r'<div class="src"><b>#\d+\s+([A-Z][A-Z0-9.\-]+)\s+[^<]*</b><span>([^<]+)</span>', section)
    return dict(blocks)


def robinhood_compatible(sym: str) -> bool:
    if re.fullmatch(r"[A-Z]+-USD", sym):
        return True
    if "." in sym:
        return False
    return bool(re.fullmatch(r"[A-Z][A-Z0-9\-]{0,6}", sym))


def unique(seq: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in seq:
        sym = raw.strip().upper()
        if not robinhood_compatible(sym):
            continue
        if sym not in seen:
            seen.add(sym)
            out.append(sym)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--main", action="store_true", help="Primary + mega-cap tickers (existing behavior)")
    ap.add_argument("--supplementary", action="store_true", help="Raw Yahoo discovery supplementary tickers")
    ap.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    ap.add_argument("--nightly", type=Path, default=None)
    ap.add_argument("--dashboard", type=Path, default=REPORTS / "signal-board.html")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    nightly = args.nightly or latest_nightly_report()
    dashboard_tickers = dashboard_board_tickers(args.dashboard)

    # Main: primary recommendation candidates + mega-cap context
    main_tickers = unique(dashboard_tickers or ranked_markdown_tickers(nightly))[: args.limit]

    if args.main:
        tickers = main_tickers
    elif args.supplementary:
        disc = discovery_tickers(args.dashboard)
        # lanes to include: primary lane, not enriched
        # lanes to exclude: mega context, non-equity / omitted
        include_lanes = {"primary lane", "not enriched"}
        supp_tickers = unique(
            sym for sym, lane in disc.items()
            if lane.strip().lower() in include_lanes
        )[: args.limit]
        tickers = supp_tickers
    else:
        # Default: main tickers
        tickers = main_tickers

    if args.json:
        import json
        print(json.dumps({
            "date": et_today(),
            "nightly": str(nightly) if nightly else None,
            "count": len(tickers),
            "tickers": tickers
        }, indent=2))
    else:
        print(" ".join(tickers))
    return 0 if tickers else 2


if __name__ == "__main__":
    raise SystemExit(main())