#!/usr/bin/env python3
"""Build a small, mobile-first Daily Delta bundle.

The list manifest deliberately contains no galleries.  A gallery is fetched only
after its card is opened, keeping the first phone load bounded and predictable.
"""
from __future__ import annotations

import json
import re
import hashlib
import shutil
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DATA = PUBLIC / "data"
OUT = PUBLIC / "daily" / "data"
DETAILS = OUT / "listings"


def read(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return default


def norm_source(raw: str, fallback: str = "") -> str:
    text = (raw or fallback or "").lower()
    return "rwi" if text == "rwi" or text.startswith("rwi") else "reddit"


def number(value):
    match = re.search(r"\d+(?:\.\d+)?", str(value or "").replace(",", ""))
    return float(match.group(0)) if match else None


def stamp(value: str) -> float:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (AttributeError, ValueError):
        return 0


def row_sort(row: dict) -> float:
    """Prefer the crawler's chronological sort field, then the listing date."""
    value = row.get("sort")
    try:
        if value is not None:
            return float(value)
    except (TypeError, ValueError):
        pass
    return stamp(row.get("postedAt") or row.get("posted") or row.get("firstSeenAt") or row.get("lastSeenAt") or "")


def detail_key(prefix: str, row: dict) -> str:
    identity = str(row.get("id") or row.get("url") or row.get("title") or "untitled")
    # The same listing may appear in Today and All.  Its client-side triage
    # state must follow it across those views, so the key cannot include scope.
    return f"listing-{hashlib.sha1(identity.encode()).hexdigest()[:16]}"


BRANDS = (
    "Rolex", "Cartier", "Omega", "Tudor", "Audemars Piguet", "Patek Philippe",
    "Richard Mille", "IWC", "Panerai", "Breitling", "Tag Heuer", "Vacheron Constantin",
    "Jaeger-LeCoultre", "Bvlgari", "Hublot", "Longines", "Seiko",
)
FACTORIES = ("VSF", "Clean", "CF", "ZF", "ARF", "BVF", "GMF", "BTF", "V6F", "AF", "PPF", "RF", "TF", "Noob", "K11", "3KF", "APS")


def tag_for(row: dict, values: tuple[str, ...]) -> str:
    title = str(row.get("title") or "")
    for value in values:
        if re.search(rf"(?<![a-z0-9]){re.escape(value)}(?![a-z0-9])", title, re.I):
            return value
    return ""


def clean_crosspost_title(value: str) -> str:
    text = str(value or "").lower()
    text = re.sub(r"\b(wts|fs|wtb|conus|usa|us|eu|uk|ww|worldwide|for sale|for-sale)\b", " ", text)
    text = re.sub(r"[$€£]\s*\d+(?:[.,]\d+)?", " ", text)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text)).strip()


def crosspost_key(row: dict) -> str:
    """Group a Reddit listing syndicated to several communities, not unrelated reposts."""
    if norm_source(row.get("sourceGroup"), row.get("source")) != "reddit":
        return "item:" + str(row.get("url") or row.get("id") or "")
    seller = re.sub(r"[^a-z0-9]+", "", str(row.get("seller") or "").lower())
    title = clean_crosspost_title(row.get("title") or "")
    if not seller or len(title) < 8:
        return "item:" + str(row.get("url") or row.get("id") or "")
    return f"reddit:{seller}:{title}"


def card(row: dict, detail_id: str, gallery: list[str], group_count: int = 1, crosspost_count: int = 1) -> dict:
    source = norm_source(row.get("sourceGroup"), row.get("source"))
    status = str(row.get("status") or "available").lower().replace("for sale", "available")
    price = row.get("price")
    return {
        "id": detail_id,
        "source": source,
        "sourceLabel": row.get("sourceLabel") or row.get("source") or ("RWI" if source == "rwi" else "Reddit"),
        "status": status,
        "title": row.get("title") or "Untitled",
        "price": price or None,
        "priceNumber": number(price),
        "seller": row.get("seller") or "",
        "postedAt": row.get("postedAt") or row.get("posted") or "",
        "sort": row_sort(row),
        "thumb": (gallery or [row.get("thumb") or ""])[0] or "",
        "hasGallery": bool(gallery),
        "galleryCount": len(gallery),
        "groupCount": group_count,
        "priceDrop": bool(row.get("wasPriceDrop")) or row.get("postType") == "price_drop",
        "brand": tag_for(row, BRANDS),
        "factory": tag_for(row, FACTORIES),
        "crosspostCount": crosspost_count,
    }


def gallery_for(row: dict, lookup: dict[str, dict]) -> list[str]:
    hit = lookup.get((row.get("url") or "").rstrip("/")) or lookup.get(row.get("id") or "") or row
    values = hit.get("images") or ([] if not hit.get("thumb") else [hit["thumb"]])
    return [x for x in values if isinstance(x, str) and x.startswith(("http://", "https://", "/"))][:24]


def grouped(rows: list[dict], lookup: dict[str, dict]) -> list[tuple[dict, list[dict], list[str]]]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        source = norm_source(row.get("sourceGroup"), row.get("source"))
        # Reddit seller posts commonly contain several listings. Keep those cards together.
        key = ("post:" + (row.get("url") or row.get("groupKey") or row.get("id") or "")) if source == "reddit" else "item:" + (row.get("id") or row.get("url") or "")
        groups[key].append(row)
    result = []
    for key, entries in groups.items():
        first = max(entries, key=lambda r: stamp(r.get("firstSeenAt") or r.get("postedAt") or r.get("lastSeenAt") or ""))
        images: list[str] = []
        for entry in entries:
            for image in gallery_for(entry, lookup):
                if image not in images:
                    images.append(image)
        result.append((first, entries, images))
    return sorted(result, key=lambda x: stamp(x[0].get("firstSeenAt") or x[0].get("postedAt") or x[0].get("lastSeenAt") or ""), reverse=True)


def build_cards(rows: list[dict], lookup: dict[str, dict], details: dict[str, dict], prefix: str) -> list[dict]:
    out = []
    for n, (first, entries, images) in enumerate(grouped(rows, lookup)):
        detail_id = detail_key(f"{prefix}-{n}", first)
        shown = first.copy()
        if len(entries) > 1:
            shown["title"] = f"{len(entries)} watches in one seller post"
            prices = [number(x.get("price")) for x in entries]
            prices = [p for p in prices if p is not None]
            shown["price"] = f"{min(prices):g}–{max(prices):g}" if len(set(prices)) > 1 else (f"{prices[0]:g}" if prices else None)
        out.append(card(shown, detail_id, images, len(entries)))
        details[detail_id] = {
            "id": detail_id, "url": first.get("url") or "", "title": shown.get("title"),
            "source": out[-1]["source"], "sourceLabel": out[-1]["sourceLabel"], "status": out[-1]["status"],
            "price": shown.get("price"), "seller": first.get("seller") or "", "postedAt": first.get("postedAt") or first.get("posted") or "",
            "images": images, "items": [{"title": x.get("title") or "Untitled", "price": x.get("price"), "url": x.get("url") or ""} for x in entries],
        }
    return out


def build_catalog(rows: list[dict], details: dict[str, dict], prefix: str = "listing") -> list[dict]:
    """Build one compact card per active listing, collapsing Reddit cross-posts.

    Images remain only in per-listing detail files; the catalog carries one
    thumbnail URL so the browsing view remains visual without shipping galleries.
    """
    out = []
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        identity = str(row.get("url") or row.get("id") or "")
        if not identity:
            continue
        groups[crosspost_key(row)].append(row)
    for entries in groups.values():
        # A genuinely later repost by the same seller should remain discoverable.
        entries.sort(key=row_sort, reverse=True)
        primary = entries[0]
        detail_id = detail_key(prefix, primary)
        images: list[str] = []
        for row in entries:
            for image in gallery_for(row, {}):
                if image not in images:
                    images.append(image)
        source_posts = []
        seen_urls: set[str] = set()
        for row in entries:
            url = row.get("url") or ""
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            source_posts.append({
                "url": url,
                "community": row.get("subreddit") or "RWI",
                "sourceLabel": row.get("source") or ("RWI" if norm_source(row.get("sourceGroup"), row.get("source")) == "rwi" else "Reddit"),
                "postedAt": row.get("postedAt") or row.get("posted") or "",
            })
        entry = card(primary, detail_id, images, crosspost_count=len(source_posts))
        entry["subreddit"] = primary.get("subreddit") or ""
        entry["location"] = primary.get("location") or ""
        entry["condition"] = primary.get("condition") or ""
        out.append(entry)
        details[detail_id] = {
            "id": detail_id, "url": primary.get("url") or "", "title": primary.get("title") or "Untitled",
            "source": entry["source"], "sourceLabel": entry["sourceLabel"], "status": entry["status"],
            "price": primary.get("price") or None, "seller": primary.get("seller") or "",
            "postedAt": primary.get("postedAt") or primary.get("posted") or "", "location": primary.get("location") or "",
            "condition": primary.get("condition") or "", "brand": entry["brand"], "factory": entry["factory"],
            "images": images, "sources": source_posts,
            "items": [{"title": row.get("title") or "Untitled", "price": row.get("price"), "url": row.get("url") or ""} for row in entries],
        }
    return sorted(out, key=lambda x: x["sort"], reverse=True)


def main():
    latest = read(DATA / "latest.json", {})
    daily = read(DATA / "daily_watch_dashboard.json", {})
    current = latest.get("currentItems") or latest.get("items") or []
    by_key = {}
    for item in current + (latest.get("items") or []):
        if item.get("url"):
            by_key[item["url"].rstrip("/")] = item
        if item.get("id"):
            by_key[item["id"]] = item

    details = {}
    # Today's browsing view is the current, normalized set of listings seen
    # today—not merely the alert ledger.  That is the useful answer to “what
    # is new today?”, and keeps its direct thumbnails/galleries intact.
    today = build_catalog(latest.get("items") or [], details, "today")
    catalog = build_catalog(current, details, "listing")
    manifest = {
        # The delta state changes independently of the full inventory snapshot.
        "generatedAt": daily.get("updatedAt") or latest.get("generatedAt") or datetime.now(timezone.utc).isoformat(),
        "day": daily.get("day"), "today": today,
        "summary": {"today": len(today), "catalog": len(catalog), "priceDrops": sum(x["priceDrop"] for x in today)},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    if DETAILS.exists():
        shutil.rmtree(DETAILS)
    DETAILS.mkdir()
    (OUT / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")))
    # Load only when the user switches to All listings. It is intentionally a
    # compact card index, not a copy of latest.json and its image galleries.
    (OUT / "catalog.json").write_text(json.dumps({"items": catalog}, separators=(",", ":")))
    for key, value in details.items():
        (DETAILS / f"{key}.json").write_text(json.dumps(value, separators=(",", ":")))
    print(json.dumps({"manifest": str(OUT / "manifest.json"), "todayCards": len(today), "catalogCards": len(catalog), "details": len(details)}))


if __name__ == "__main__":
    main()
