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


def score(info):
    return info.get('score', 0)


def evidence_text(info):
    catalysts = ', '.join(info.get('catalysts', {}).keys()) if info.get('catalysts') else 'no dominant catalyst yet'
    return f"{info.get('mentions', 0)} mention(s) across {info.get('distinct_sources', 0)} source(s), weighted source score {info.get('weighted_source_score', 0)}, with {catalysts} driving the setup."


def next_week_outlook(info):
    s = score(info)
    if s >= 12:
        return 'Best candidate for a next-week momentum or catalyst continuation move.'
    if s >= 8:
        return 'Viable next-week setup if fresh confirmation appears early in the week.'
    return 'Lower-confidence next-week watchlist candidate.'


def move_posture(info):
    s = score(info)
    if s >= 12:
        return 'Strongest candidate to plan around for next week, ideally with disciplined entry criteria.'
    if s >= 8:
        return 'Keep high on the watchlist and act only if Monday or Tuesday confirms the narrative.'
    return 'Watchlist only, not a high-conviction idea yet.'


def goal_range_text(info):
    mentions = info.get('mentions', 0)
    distinct_sources = info.get('distinct_sources', 0)
    if mentions >= 4 and distinct_sources >= 2:
        return 'Next-week price-goal framing: roughly +4% to +8% if momentum persists.'
    if mentions >= 2:
        return 'Next-week price-goal framing: roughly +2% to +5% with confirmation.'
    return 'Next-week price-goal framing: likely under +3% unless a new catalyst appears.'


def main():
    REPORTS.mkdir(parents=True, exist_ok=True)
    tickers = load_json(TICKERS, {})
    ranked = sorted(tickers.items(), key=lambda kv: score(kv[1]), reverse=True)[:5]
    emerging = [kv for kv in sorted(tickers.items(), key=lambda kv: score(kv[1]), reverse=True) if kv[1].get('rarity_bonus', 0) > 0][:3]
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    lines = [f'# Friday recommendations for next week - {today}', '', 'Forward-looking ideas based on the prior collection window and article-flow signals.', '']
    if not ranked:
        lines.append('No collected article data yet.')
    for i, (ticker, info) in enumerate(ranked, start=1):
        lines.append(f'## {i}. {ticker}')
        lines.append(f"- evidence gathered: {evidence_text(info)}")
        lines.append(f"- sentiment balance: bullish {info.get('bullish', 0)}, bearish {info.get('bearish', 0)}, neutral {info.get('neutral', 0)}")
        lines.append(f"- novelty / repeat balance: +{info.get('novelty_bonus', 0)} novelty, +{info.get('rarity_bonus', 0)} rarity, -{info.get('recurring_penalty', 0)} recurring")
        catalysts = info.get('catalysts', {})
        lines.append(f"- why it surfaced: repeated article presence, source overlap, and catalyst clustering around {', '.join(catalysts.keys()) if catalysts else 'general narrative flow'}")
        lines.append(f"- next-week thesis: {next_week_outlook(info)}")
        lines.append(f"- suggested move posture: {move_posture(info)}")
        lines.append(f"- price-goal framing: {goal_range_text(info)}")
        lines.append(f"- confidence: {'high' if score(info) >= 12 else 'medium' if score(info) >= 8 else 'low'}")
        lines.append('')
    if emerging:
        lines.append('## Emerging tickers')
        for ticker, info in emerging:
            lines.append(f"- {ticker}: {info.get('mentions', 0)} mention(s), {info.get('distinct_sources', 0)} source(s), score {info.get('score', 0)}")
        lines.append('')
    out = REPORTS / f'weekly-next-week-{today}.md'
    out.write_text('\n'.join(lines).strip() + '\n')
    print(out)

if __name__ == '__main__':
    main()
