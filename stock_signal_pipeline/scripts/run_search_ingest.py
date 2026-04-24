#!/usr/bin/env python3
import json
import re
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
CONFIG = ROOT / 'config' / 'queries.json'
ARTICLES = DATA / 'articles.jsonl'
TICKERS = DATA / 'tickers.json'
SEEN = DATA / 'seen_urls.json'
TMP = ROOT / '.firecrawl'
RECENT = DATA / 'recent_ticker_history.json'

TICKER_RE = re.compile(r'\(([A-Z]{1,5})(?::[A-Za-z]+)?\)|\b([A-Z]{2,5})\b')
TICKER_STOPWORDS = {
    'US', 'AT', 'YTD', 'NEW', 'YORK', 'PDT', 'UK', 'AI', 'CEO', 'IPO', 'TOP', 'NEWS', 'PRO',
    'NYSE', 'NASDAQ', 'ETF', 'AFP', 'EPS', 'BTC', 'FX', 'EV', 'DJIA', 'SPX', 'AND', 'THE', 'OR',
    'IT', 'ARM', 'Q', 'U', 'N', 'S', 'A', 'I'
}
URL_NOISE_PARTS = ['/quotes/', '/quote/', '/newsletters/', '/investingclub/', '/bonds-headlines/']
CATALYST_WORDS = {
    'earnings': ['earnings', 'guidance', 'forecast'],
    'analyst': ['upgrade', 'downgrade', 'price target', 'analyst', 'catalyst watch'],
    'options': ['options', 'unusual options', 'whale alerts'],
    'deal': ['partnership', 'contract', 'acquisition', 'deal'],
    'regulatory': ['fda', 'approval', 'investigation'],
    'momentum': ['rally', 'breakout', 'surge', 'bullish']
}

SOURCE_WEIGHTS = {
    'www.reuters.com': 1.0,
    'www.barrons.com': 0.95,
    'www.cnbc.com': 0.9,
    'www.marketwatch.com': 0.75,
    'www.benzinga.com': 0.55,
    'seekingalpha.com': 0.5
}

BAD_TITLE_PATTERNS = [
    'stock price |',
    'stock price, quote, news',
    'quote, news & history',
    'quote, news & analysis',
    'overview',
    'top pro news',
    'best stocks under $10',
    'advisor:',
    'video and transcript',
    'conference call',
    'transcript:',
    'price prediction',
    'how to earn $',
    '10 financials stocks',
    'market brief:',
    'stock movers',
    'newsletter'
]

BAD_URL_PARTS = [
    '/investing/',
    '/quote/',
    '/quotes/',
    '/symbol/',
    '/pro/',
    '/advisor/',
    '/money/stocks-under-10',
    '/investingclub/newsletter',
    '/newsletters/'
]


def load_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text())


def save_json(path, payload):
    path.write_text(json.dumps(payload, indent=2))


def infer_sentiment(text):
    t = text.lower()
    pos = sum(word in t for word in ['surge', 'beat', 'upgrade', 'bullish', 'buy', 'rally', 'breakout'])
    neg = sum(word in t for word in ['miss', 'downgrade', 'bearish', 'sell', 'drop', 'fall', 'risk'])
    if pos > neg:
        return 'bullish'
    if neg > pos:
        return 'bearish'
    return 'neutral'


def infer_catalysts(text):
    t = text.lower()
    hits = []
    for tag, words in CATALYST_WORDS.items():
        if any(w in t for w in words):
            hits.append(tag)
    return hits


def infer_tickers(title, snippet):
    text = f"{title} {snippet}"
    raw = []
    for match in TICKER_RE.findall(text):
        token = match[0] or match[1]
        if token:
            raw.append(token)
    # manual company inference for common headline styles without explicit ticker markup
    title_lower = title.lower()
    company_map = {
        'tesla': 'TSLA',
        'nike': 'NKE',
        'morgan stanley': 'MS',
        'nvidia': 'NVDA',
        'apple': 'AAPL',
        'affirm': 'AFRM',
        'broadcom': 'AVGO',
        'meta': 'META',
        'marvell': 'MRVL',
        'snap ': 'SNAP',
        'asml': 'ASML',
        'altria': 'MO',
        'dutch bros': 'BROS',
        'pagaya': 'PGY',
        'bloom energy': 'BE',
        'allison transmission': 'ALSN',
        'pepsico': 'PEP',
        'kkr': 'KKR',
        'echostar': 'SATS',
        'microsoft': 'MSFT',
        'amazon': 'AMZN',
        'alphabet': 'GOOGL',
        'google': 'GOOGL',
        'netflix': 'NFLX',
        'amd': 'AMD',
        'palantir': 'PLTR',
        'super micro': 'SMCI',
        'eli lilly': 'LLY',
        'novo nordisk': 'NVO',
        'coinbase': 'COIN',
        'robinhood': 'HOOD',
        'sofi': 'SOFI',
        'boeing': 'BA',
        'ford': 'F',
        'general motors': 'GM',
        'disney': 'DIS',
        'uber': 'UBER',
        'lyft': 'LYFT'
    }
    for name, ticker in company_map.items():
        if name in title_lower:
            raw.append(ticker)
    blacklist = {
        'USA', 'SPDR', 'CAKE', 'GOLD', 'BONDS', 'ASIA', 'EUR', 'NAV', 'CEF', 'SDS', 'TSMC',
        'CNBC', 'WSJ', 'S&P'
    }
    return sorted({r for r in raw if r not in blacklist and r not in TICKER_STOPWORDS})[:5]


def is_relevant_article(title, url):
    t = title.lower().strip()
    u = url.lower().strip()
    if any(pattern in t for pattern in BAD_TITLE_PATTERNS):
        return False
    if any(part in u for part in BAD_URL_PARTS):
        return False
    if any(part in u for part in URL_NOISE_PARTS):
        return False
    if 'bitcoin' in t or 'crypto' in t or 'defi' in t or 'token' in t:
        return False
    if u.endswith('/quotes') or '/quotes/' in u:
        return False
    if 'newsletters' in u or 'investingclub' in u:
        return False
    return True


def run_firecrawl_search(query, max_results):
    TMP.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r'[^a-z0-9]+', '-', query.lower()).strip('-')[:80]
    out = TMP / f'{slug}.json'
    cmd = [
        'firecrawl', 'search', query,
        '--sources', 'news',
        '--tbs', 'qdr:d',
        '--limit', str(max_results),
        '--json',
        '-o', str(out)
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    payload = json.loads(out.read_text())
    news = payload.get('data', {}).get('news', [])
    results = []
    for item in news:
        results.append({
            'title': item.get('title', ''),
            'url': item.get('url', ''),
            'snippet': item.get('snippet', ''),
            'source': (item.get('url', '').split('/')[2] if item.get('url') else ''),
            'date': item.get('date', '')
        })
    return results


def rebuild_tickers(entries, recent_history=None):
    recent_history = recent_history or {}
    summary = defaultdict(lambda: {
        'mentions': 0,
        'sources': set(),
        'weighted_source_score': 0.0,
        'bullish': 0,
        'bearish': 0,
        'neutral': 0,
        'catalysts': defaultdict(int),
        'urls': [],
        'source_breakdown': defaultdict(int)
    })
    for entry in entries:
        for ticker in entry.get('tickers', []):
            s = summary[ticker]
            source = entry.get('source', 'unknown')
            s['mentions'] += 1
            s['sources'].add(source)
            s['weighted_source_score'] += SOURCE_WEIGHTS.get(source, 0.4)
            s['source_breakdown'][source] += 1
            s[entry.get('sentiment', 'neutral')] += 1
            for c in entry.get('catalysts', []):
                s['catalysts'][c] += 1
            s['urls'].append(entry.get('url'))
    out = {}
    for ticker, s in summary.items():
        history = recent_history.get(ticker, {})
        history_mentions = list(history.get('history_mentions', []))
        previous_mentions = int(history.get('mentions', 0) or 0)
        average_recent_mentions = (sum(history_mentions) / len(history_mentions)) if history_mentions else 0.0
        recurring_penalty = min((previous_mentions * 0.35) + (average_recent_mentions * 0.4), 5.0)
        novelty_bonus = 0.0 if previous_mentions or history_mentions else 3.0
        rarity_bonus = 2.0 if s['mentions'] <= 2 and len(s['sources']) >= 2 else 0.0
        weighted_score = s['mentions'] * 1.5 + len(s['sources']) * 2.5 + s['weighted_source_score'] * 4 + (s['bullish'] - s['bearish']) * 2 + sum(s['catalysts'].values()) + novelty_bonus + rarity_bonus - recurring_penalty
        out[ticker] = {
            'mentions': s['mentions'],
            'distinct_sources': len(s['sources']),
            'weighted_source_score': round(s['weighted_source_score'], 2),
            'bullish': s['bullish'],
            'bearish': s['bearish'],
            'neutral': s['neutral'],
            'catalysts': dict(s['catalysts']),
            'urls': s['urls'][:10],
            'source_breakdown': dict(s['source_breakdown']),
            'novelty_bonus': round(novelty_bonus, 2),
            'rarity_bonus': round(rarity_bonus, 2),
            'recurring_penalty': round(recurring_penalty, 2),
            'previous_mentions': previous_mentions,
            'average_recent_mentions': round(average_recent_mentions, 2),
            'score': round(weighted_score, 2)
        }
    return out


def update_recent_history(current_summary, existing_history):
    updated = {}
    now = datetime.now(timezone.utc).isoformat()
    for ticker, info in current_summary.items():
        prev = existing_history.get(ticker, {})
        history_mentions = list(prev.get('history_mentions', []))
        if prev.get('mentions') is not None:
            history_mentions.append(int(prev.get('mentions', 0) or 0))
        history_mentions = history_mentions[-6:]
        updated[ticker] = {
            'mentions': info.get('mentions', 0),
            'last_score': info.get('score', 0),
            'updated_at': now,
            'seen_runs': int(prev.get('seen_runs', 0) or 0) + 1,
            'history_mentions': history_mentions,
        }
    for ticker, prev in existing_history.items():
        if ticker not in updated:
            updated[ticker] = prev
    return updated


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    cfg = load_json(CONFIG, {'queries': [], 'maxResultsPerQuery': 8})
    seen = set(load_json(SEEN, []))
    recent_history = load_json(RECENT, {})
    existing = []
    if ARTICLES.exists():
        existing = [json.loads(line) for line in ARTICLES.read_text().splitlines() if line.strip()]
    new_entries = []
    now = datetime.now(timezone.utc).isoformat()
    for query in cfg.get('queries', []):
        try:
            results = run_firecrawl_search(query, cfg.get('maxResultsPerQuery', 8))
        except Exception as err:
            print(json.dumps({'query': query, 'error': str(err)}))
            continue
        for item in results:
            url = item.get('url')
            title = item.get('title', '')
            snippet = item.get('snippet', '')
            if not url or url in seen:
                continue
            if not is_relevant_article(title, url):
                continue
            tickers = infer_tickers(title, snippet)
            if not tickers:
                continue
            entry = {
                'discovered_at': now,
                'query': query,
                'source': item.get('source', ''),
                'title': title,
                'snippet': snippet,
                'url': url,
                'published_hint': item.get('date', ''),
                'tickers': tickers,
                'sentiment': infer_sentiment(f'{title} {snippet}'),
                'catalysts': infer_catalysts(f'{title} {snippet}'),
                'source_weight': SOURCE_WEIGHTS.get(item.get('source', ''), 0.4),
                'scraped': False
            }
            new_entries.append(entry)
            seen.add(url)
    all_entries = existing + new_entries
    if new_entries:
        with ARTICLES.open('a') as f:
            for entry in new_entries:
                f.write(json.dumps(entry) + '\n')
    save_json(SEEN, sorted(seen))
    ticker_summary = rebuild_tickers(all_entries, recent_history)
    save_json(TICKERS, ticker_summary)
    save_json(RECENT, update_recent_history(ticker_summary, recent_history))
    print(json.dumps({
        'new_entries': len(new_entries),
        'total_entries': len(all_entries),
        'tracked_tickers': len(ticker_summary),
        'top_tickers': sorted(ticker_summary.items(), key=lambda kv: kv[1].get('score', 0), reverse=True)[:5]
    }, indent=2))

if __name__ == '__main__':
    main()
