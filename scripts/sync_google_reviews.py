#!/usr/bin/env python3
"""
Best-effort Google reviews extractor (without API key).

This script fetches public Google search pages for Vyntyra name variants,
extracts aggregate rating and review count, and writes a normalized snapshot
that backend /api/metrics/reviews/google can consume.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlparse, parse_qs, unquote_plus
from urllib.request import Request, urlopen

GOOGLE_SEARCH_ENDPOINT = "https://www.google.com/search"
GOOGLE_MAPS_PLACE_ENDPOINT = "https://www.google.com/maps/place/"
DEFAULT_QUERIES = [
    "Vyntyra Consultancy Services",
    "Vyntyra Consultancy Services Pvt Ltd",
]
DEFAULT_SOURCE_URLS = [
    "https://share.google/oWgVhPgj7RhLakGNX",
]


@dataclass
class ReviewItem:
    authorName: str
    profilePhotoUrl: str | None
    rating: float
    text: str | None
    relativeTimeDescription: str | None
    publishedAtEpoch: int
    sourceUrl: str | None


@dataclass
class PlaceSnapshot:
    placeId: str | None
    name: str
    mapUrl: str | None
    address: str | None
    rating: float
    totalRatings: int
    reviews: list[ReviewItem]


def normalize_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text if text else None


def to_number(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).replace(",", "").strip()
    if not text:
        return None
    try:
        parsed = float(text)
    except ValueError:
        return None
    return parsed


def fetch_text(url: str, timeout: int = 15) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; VyntyraPythonSync/1.0)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urlopen(req, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def collect_jsonld_nodes(html: str) -> list[Any]:
    matches = re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>',
        html,
        flags=re.IGNORECASE,
    )
    nodes: list[Any] = []
    for raw in matches:
        try:
            nodes.append(json.loads(raw))
        except json.JSONDecodeError:
            continue
    return nodes


def walk_nodes(value: Any) -> list[dict[str, Any]]:
    collected: list[dict[str, Any]] = []

    def _walk(node: Any) -> None:
        if isinstance(node, list):
            for item in node:
                _walk(item)
            return
        if not isinstance(node, dict):
            return
        collected.append(node)
        for child in node.values():
            _walk(child)

    _walk(value)
    return collected


def extract_from_jsonld(nodes: list[Any]) -> PlaceSnapshot | None:
    for node in nodes:
        for candidate in walk_nodes(node):
            aggregate = candidate.get("aggregateRating")
            if not isinstance(aggregate, dict):
                continue

            rating = to_number(aggregate.get("ratingValue"))
            total = to_number(aggregate.get("reviewCount") or aggregate.get("ratingCount"))
            if not rating or not total:
                continue

            reviews_raw = candidate.get("review")
            if isinstance(reviews_raw, dict):
                reviews_raw = [reviews_raw]
            if not isinstance(reviews_raw, list):
                reviews_raw = []

            reviews: list[ReviewItem] = []
            for review in reviews_raw:
                if not isinstance(review, dict):
                    continue
                author = review.get("author")
                if isinstance(author, dict):
                    author_name = normalize_text(author.get("name")) or "Google User"
                else:
                    author_name = normalize_text(author) or "Google User"

                review_rating = review.get("reviewRating")
                review_score = 0.0
                if isinstance(review_rating, dict):
                    review_score = float(to_number(review_rating.get("ratingValue")) or 0)

                reviews.append(
                    ReviewItem(
                        authorName=author_name,
                        profilePhotoUrl=None,
                        rating=review_score,
                        text=normalize_text(review.get("reviewBody") or review.get("description")),
                        relativeTimeDescription=normalize_text(review.get("datePublished")),
                        publishedAtEpoch=0,
                        sourceUrl=None,
                    )
                )

            return PlaceSnapshot(
                placeId=None,
                name=normalize_text(candidate.get("name")) or "Vyntyra",
                mapUrl=None,
                address=normalize_text(candidate.get("address")),
                rating=float(rating),
                totalRatings=int(total),
                reviews=[review for review in reviews if review.text],
            )

    return None


def extract_from_raw_html(html: str, query: str) -> PlaceSnapshot | None:
    rating_match = re.search(r'"ratingValue"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?', html, flags=re.IGNORECASE)
    if not rating_match:
        rating_match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*(?:out of|/\s*5)\s*stars?', html, flags=re.IGNORECASE)

    count_match = re.search(r'"reviewCount"\s*:\s*"?([0-9,]+)"?', html, flags=re.IGNORECASE)
    if not count_match:
        count_match = re.search(r'([0-9,]+)\s+Google\s+reviews?', html, flags=re.IGNORECASE)
    if not count_match:
        count_match = re.search(r'([0-9,]+)\s+reviews?', html, flags=re.IGNORECASE)

    rating = to_number(rating_match.group(1)) if rating_match else None
    total = to_number(count_match.group(1)) if count_match else None

    if not rating or not total:
        return None

    return PlaceSnapshot(
        placeId=None,
        name=query,
        mapUrl=None,
        address=None,
        rating=float(rating),
        totalRatings=int(total),
        reviews=[],
    )


def extract_from_maps_place_html(html: str, query: str) -> PlaceSnapshot | None:
    # Google Maps public HTML often contains a compact tuple like:
    # [null,4.7,null,null,162] near the business name.
    business_markers = [
        query,
        "Vyntyra Consultancy Services",
        "Vyntyra Consultancy Services Pvt Ltd",
    ]

    for marker in business_markers:
        idx = html.find(marker)
        if idx < 0:
            continue

        window_start = max(0, idx - 200)
        window_end = min(len(html), idx + 3500)
        window = html[window_start:window_end]

        tuple_match = re.search(r"\[null,([0-9]+(?:\.[0-9]+)?),null,null,([0-9,]+)\]", window)
        if not tuple_match:
            continue

        rating = to_number(tuple_match.group(1))
        total = to_number(tuple_match.group(2))
        if not rating or not total:
            continue

        return PlaceSnapshot(
            placeId=None,
            name=normalize_text(marker) or "Vyntyra",
            mapUrl=f"{GOOGLE_MAPS_PLACE_ENDPOINT}{marker.replace(' ', '+')}",
            address=None,
            rating=float(rating),
            totalRatings=int(total),
            reviews=[],
        )

    return None


def fetch_snapshot_for_query(query: str) -> PlaceSnapshot | None:
    params = {
        "q": f"{query} google reviews",
        "hl": "en",
        "gl": "in",
        "num": "10",
    }
    url = f"{GOOGLE_SEARCH_ENDPOINT}?{urlencode(params)}"
    html = fetch_text(url)

    nodes = collect_jsonld_nodes(html)
    snapshot = extract_from_jsonld(nodes)
    if snapshot:
        return snapshot

    snapshot = extract_from_raw_html(html, query)
    if snapshot:
        return snapshot

    maps_url = f"{GOOGLE_MAPS_PLACE_ENDPOINT}{query.replace(' ', '+')}"
    maps_html = fetch_text(maps_url)
    return extract_from_maps_place_html(maps_html, query)


def fetch_final_url(url: str) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; VyntyraPythonSync/1.0)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urlopen(req, timeout=20) as response:
        return response.geturl() or url


def extract_query_from_source_url(source_url: str) -> str | None:
    try:
        final_url = fetch_final_url(source_url)
    except Exception:  # noqa: BLE001
        final_url = source_url

    parsed = urlparse(final_url)
    params = parse_qs(parsed.query)

    query_values = params.get("q") or params.get("query")
    if query_values:
        query = normalize_text(unquote_plus(query_values[0]))
        if query:
            return query

    # Last fallback: decode path segment and clean symbols.
    last_segment = normalize_text(parsed.path.split("/")[-1])
    if last_segment:
        candidate = normalize_text(unquote_plus(last_segment.replace("+", " ")))
        if candidate and len(candidate) >= 4:
            return candidate

    return None


def build_payload(places: list[PlaceSnapshot], cache_ttl_ms: int) -> dict[str, Any]:
    total_ratings = sum(max(0, place.totalRatings) for place in places)
    weighted = sum(place.rating * place.totalRatings for place in places)
    avg = round(weighted / total_ratings, 2) if total_ratings > 0 else 0.0

    merged_reviews: list[dict[str, Any]] = []
    for place in places:
        for review in place.reviews:
            row = asdict(review)
            row["placeId"] = place.placeId
            row["placeName"] = place.name
            row["placeMapUrl"] = place.mapUrl
            if row.get("text"):
                merged_reviews.append(row)

    return {
        "source": "python-google-public-search",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "places": [asdict(place) for place in places],
        "aggregate": {
            "averageRating": avg,
            "totalRatings": total_ratings,
            "totalPlaces": len(places),
        },
        "reviews": merged_reviews,
        "cached": False,
        "cacheTtlMs": max(60000, int(cache_ttl_ms)),
    }


def write_snapshot(payload: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def resolve_default_output() -> Path:
    repo_root = Path(__file__).resolve().parents[1]
    return repo_root / "backend" / "data" / "google_reviews_snapshot.json"


def run_once(output_path: Path, queries: list[str], source_urls: list[str], cache_ttl_ms: int) -> int:
    enriched_queries = list(queries)
    for source_url in source_urls:
        query = extract_query_from_source_url(source_url)
        if query and query not in enriched_queries:
            enriched_queries.append(query)

    places: list[PlaceSnapshot] = []
    for query in enriched_queries:
        try:
            snapshot = fetch_snapshot_for_query(query)
        except Exception as exc:  # noqa: BLE001
            print(f"[warn] query failed: {query} -> {exc}", file=sys.stderr)
            continue
        if snapshot and snapshot.rating > 0 and snapshot.totalRatings > 0:
            places.append(snapshot)

    if not places:
        print("[error] unable to extract any Google review aggregate", file=sys.stderr)
        return 1

    payload = build_payload(places, cache_ttl_ms=cache_ttl_ms)
    write_snapshot(payload, output_path)
    print(f"[ok] wrote snapshot: {output_path}")
    print(
        f"[ok] rating={payload['aggregate']['averageRating']} totalRatings={payload['aggregate']['totalRatings']} places={payload['aggregate']['totalPlaces']}"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync Google review snapshot (no API key)")
    parser.add_argument("--output", type=Path, default=resolve_default_output(), help="Output JSON file path")
    parser.add_argument("--cache-ttl-ms", type=int, default=900000, help="Cache ttl to write in payload")
    parser.add_argument("--interval-minutes", type=float, default=0, help="Repeat sync every N minutes (0 = once)")
    parser.add_argument("--query", action="append", default=[], help="Additional company query (can repeat)")
    parser.add_argument("--source-url", action="append", default=[], help="Google share or maps/search URL to derive query")
    args = parser.parse_args()

    queries = list(dict.fromkeys(DEFAULT_QUERIES + [q.strip() for q in args.query if q.strip()]))
    source_urls = list(dict.fromkeys(DEFAULT_SOURCE_URLS + [u.strip() for u in args.source_url if u.strip()]))

    if args.interval_minutes <= 0:
        return run_once(args.output, queries, source_urls, args.cache_ttl_ms)

    interval_seconds = max(30.0, args.interval_minutes * 60.0)
    while True:
        exit_code = run_once(args.output, queries, source_urls, args.cache_ttl_ms)
        if exit_code != 0:
            print("[warn] sync iteration failed; retrying after interval", file=sys.stderr)
        time.sleep(interval_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
