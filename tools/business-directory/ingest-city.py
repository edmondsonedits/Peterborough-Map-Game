"""Fetch the City of Peterborough's public business directory listings."""

from __future__ import annotations

import datetime as dt
import html as html_lib
import json
import re
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

from lxml import html


LANDING_URL = "https://www.peterborough.ca/business-directory/"
POST_URL = "https://www.peterborough.ca/umbraco/surface/BusinessDirectory/GetBDListingByFilters"
OUT_DIR = Path(r"H:\ChatGPT\Peterborough-Building-References-20261024\business-signs")
PAGE_SIZE = 20
PAGES = range(1, 5)


def sanitized_snapshot(source: str) -> str:
    """Remove anti-forgery and public map API-key values from cached markup."""
    source = re.sub(
        r'(<input\b[^>]*\bname=["\']__RequestVerificationToken["\'][^>]*\bvalue=["\'])[^"\']*(["\'])',
        r"\1[REDACTED]\2",
        source,
        flags=re.IGNORECASE,
    )
    source = re.sub(
        r'((?:data-)?(?:google-)?maps?-?api-?key\s*=\s*["\'])[^"\']*(["\'])',
        r"\1[REDACTED]\2",
        source,
        flags=re.IGNORECASE,
    )
    source = re.sub(r'(data-apikey\s*=\s*["\'])[^"\']*(["\'])', r"\1[REDACTED]\2", source, flags=re.IGNORECASE)
    return source


def text_of(node) -> str:
    return " ".join(" ".join(node.itertext()).split())


def listing_from_link(link, observed_at: str) -> dict | None:
    href = link.get("href", "")
    match = re.search(r"[?&]directoryId=([^&#]+)", href)
    if not match:
        return None
    card = link
    for _ in range(6):
        if card is None:
            break
        classes = set((card.get("class") or "").split())
        if "gs-feed-list-meta" in classes:
            break
        card = card.getparent()
    if card is None:
        return None

    def first_text(xpath: str) -> str:
        nodes = card.xpath(xpath)
        return text_of(nodes[0]) if nodes else ""

    map_buttons = card.xpath(".//button[contains(@class,'bd-view-on-map')]")
    map_button = map_buttons[0] if map_buttons else {}
    lat = map_button.get("data-lat")
    lon = map_button.get("data-lng")
    try:
        lat = float(lat) if lat else None
        lon = float(lon) if lon else None
    except (TypeError, ValueError):
        lat = lon = None

    categories = []
    for selector in (
        ".//*[contains(concat(' ',normalize-space(@class),' '),' bd-facilities-type ')]",
        ".//*[contains(concat(' ',normalize-space(@class),' '),' bd-installation-type ')]",
    ):
        categories.extend(text_of(node) for node in card.xpath(selector) if text_of(node))

    address = first_text(
        ".//*[contains(concat(' ',normalize-space(@class),' '),' bd-address ')]"
    )
    return {
        "id": "city-directory:" + urllib.parse.unquote(match.group(1)),
        "sourceBusinessId": urllib.parse.unquote(match.group(1)),
        "name": text_of(link),
        "address": address,
        "lat": lat,
        "lon": lon,
        "category": "; ".join(dict.fromkeys(categories)),
        "sourceUrl": urllib.parse.urljoin(LANDING_URL, href),
        "website": "",
        "observedAt": observed_at,
        "sourceKind": "city-directory",
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cookies = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
    request = urllib.request.Request(
        LANDING_URL,
        headers={"User-Agent": "Mozilla/5.0 (compatible; PeterboroughMapGame/1.0)"},
    )
    with opener.open(request, timeout=35) as response:
        landing_source = response.read().decode("utf-8", "replace")
    OUT_DIR.joinpath("city-directory.html").write_text(
        sanitized_snapshot(landing_source), encoding="utf-8"
    )

    document = html.fromstring(landing_source)
    tokens = document.xpath(
        "//input[@name='__RequestVerificationToken']/@value"
    )
    if not tokens:
        raise RuntimeError("City directory anti-forgery token was not present")
    token = tokens[0]
    observed_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    records: dict[str, dict] = {}

    for page in PAGES:
        form = {"data": "", "keyword": "", "page": page, "pageSize": PAGE_SIZE,
                "homeNodeId": "1425", "landingPageId": "5486", "culture": "en-US"}
        body = urllib.parse.urlencode(form).encode("utf-8")
        request = urllib.request.Request(
            POST_URL,
            data=body,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; PeterboroughMapGame/1.0)",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "RequestVerificationToken": token,
                "X-Requested-With": "XMLHttpRequest",
                "Referer": LANDING_URL,
            },
        )
        with opener.open(request, timeout=35) as response:
            payload = response.read().decode("utf-8", "replace")
        OUT_DIR.joinpath(f"city-directory-page-{page}.html").write_text(
            sanitized_snapshot(payload), encoding="utf-8"
        )
        try:
            parsed = json.loads(payload)
            fragment = parsed.get("data", parsed.get("html", payload))
        except json.JSONDecodeError:
            fragment = payload
        fragment = html_lib.unescape(fragment) if isinstance(fragment, str) else str(fragment)
        print(json.dumps({'page': page, 'bytes': len(fragment)}), flush=True)
        fragment_doc = html.fromstring(fragment)
        links = fragment_doc.xpath(".//a[contains(@href,'directoryId')]")
        for link in links:
            item = listing_from_link(link, observed_at)
            if item and item["name"]:
                records[item["id"]] = item

    ordered = sorted(records.values(), key=lambda item: (item["name"].casefold(), item["id"]))
    output = {
        "source": LANDING_URL,
        "sourceKind": "city-directory",
        "observedAt": observed_at,
        "expectedListingCount": 73,
        "pageSize": PAGE_SIZE,
        "pagesFetched": len(PAGES),
        "businesses": ordered,
    }
    OUT_DIR.joinpath("city-businesses-normalized.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "records": len(ordered),
        "withCoordinates": sum(item["lat"] is not None and item["lon"] is not None for item in ordered),
        "withAddress": sum(bool(item["address"]) for item in ordered),
        "pagesFetched": len(PAGES),
        "output": str(OUT_DIR / "city-businesses-normalized.json"),
    }))
    if len(ordered) != 73:
        raise SystemExit("Expected 73 distinct listings; preserved partial output for review")


if __name__ == "__main__":
    main()
