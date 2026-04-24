#!/usr/bin/env python3
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
REPORTS = ROOT / 'reports'
TICKERS = DATA / 'tickers.json'


def load_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text())


def evidence_text(info):
    catalysts = ', '.join(info.get('catalysts', {}).keys()) if info.get('catalysts') else 'no dominant catalyst yet'
    return f"{info.get('mentions', 0)} mention(s) across {info.get('distinct_sources', 0)} source(s), weighted source score {info.get('weighted_source_score', 0)}, with {catalysts} as the main detected driver(s)."


def daily_take(info):
    mentions = info.get('mentions', 0)
    score = info.get('score', 0)
    if score >= 12:
        return 'Article flow suggests a real near-term setup heading into the next session, especially if broader tape stays supportive.'
    if score >= 7:
        return 'Constructive short-term setup, but still needs another confirming article, analyst action, or price follow-through.'
    if mentions > 0:
        return 'Early signal only. Worth watching, but not strong enough yet to lean on alone.'
    return 'No real signal yet.'


def move_suggestion(info):
    score = info.get('score', 0)
    if score >= 12:
        return 'Potential watch-for-entry candidate on strength or on a controlled pullback.'
    if score >= 8:
        return 'Keep on next-session watchlist and wait for confirmation before acting.'
    return 'Observation only for now, not a strong move candidate yet.'


def price_goal_text(info):
    score = info.get('score', 0)
    if score >= 12:
        return 'Near-term price goal framing: roughly +4% to +7% if momentum confirms tomorrow.'
    if score >= 8:
        return 'Near-term price goal framing: roughly +2% to +5% on confirmation.'
    return 'Near-term price goal framing: under +3% unless a new catalyst appears.'


def main():
    REPORTS.mkdir(parents=True, exist_ok=True)
    tickers = load_json(TICKERS, {})
    ranked = sorted(tickers.items(), key=lambda kv: kv[1].get('score', 0), reverse=True)[:5]
    emerging = [kv for kv in sorted(tickers.items(), key=lambda kv: kv[1].get('score', 0), reverse=True) if kv[1].get('rarity_bonus', 0) > 0][:3]
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    lines = [f'# Nightly stock signal report - {today}', '', 'What today\'s article flow is pointing to for the near term.', '']
    if not ranked:
        lines.append('No article data collected yet.')
    for ticker, info in ranked:
        lines.append(f'## {ticker}')
        lines.append(f"- evidence gathered: {evidence_text(info)}")
        lines.append(f"- sentiment mix: bullish {info.get('bullish', 0)}, bearish {info.get('bearish', 0)}, neutral {info.get('neutral', 0)}")
        lines.append(f"- novelty / repeat balance: +{info.get('novelty_bonus', 0)} novelty, +{info.get('rarity_bonus', 0)} rarity, -{info.get('recurring_penalty', 0)} recurring")
        lines.append(f"- what the evidence points to: {daily_take(info)}")
        lines.append(f"- suggested move posture: {move_suggestion(info)}")
        lines.append(f"- price target framing: {price_goal_text(info)}")
        lines.append('')
    if emerging:
        lines.append('## Emerging tickers')
        for ticker, info in emerging:
            lines.append(f"- {ticker}: {info.get('mentions', 0)} mention(s), {info.get('distinct_sources', 0)} source(s), score {info.get('score', 0)}")
        lines.append('')
    out = REPORTS / f'nightly-{today}.md'
    out.write_text('\n'.join(lines).strip() + '\n')
    print(out)

if __name__ == '__main__':
    main()
