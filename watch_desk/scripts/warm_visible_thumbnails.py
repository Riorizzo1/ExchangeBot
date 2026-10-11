#!/usr/bin/env python3
"""Warm compact card thumbnails after a publish without blocking it.

Only the likely first screens are requested.  The local server converts each
remote source image to a small cached JPEG, so phone browsing never needs to
wait on a 1–5 MB Reddit image for the initial cards.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

ROOT = Path('/Users/bobby/.openclaw/workspace')
DATA = ROOT / 'watch_desk' / 'public' / 'daily' / 'data'
BASE = 'http://127.0.0.1:4314/proxy-image?thumb=1&u='


def load(name, fallback):
    try:
        return json.loads((DATA / name).read_text())
    except Exception:
        return fallback


def main():
    manifest = load('manifest.json', {})
    catalog = load('catalog.json', {})
    # Warm the first two browsing screens in both scopes. Dedupe thumbnail URLs
    # and use bounded concurrency so this never overwhelms the source hosts.
    candidates = (manifest.get('today') or [])[:36] + (catalog.get('items') or [])[:18]
    urls = list(dict.fromkeys(x.get('thumb') for x in candidates if str(x.get('thumb') or '').startswith('http')))[:48]
    def warm(url):
        try:
            with urlopen(BASE + quote(url, safe=''), timeout=12) as response:
                response.read(1)
            return True
        except Exception:
            return False
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(warm, urls))
    print(json.dumps({'requested': len(urls), 'warmed': sum(results), 'failed': len(urls) - sum(results)}))


if __name__ == '__main__':
    main()
