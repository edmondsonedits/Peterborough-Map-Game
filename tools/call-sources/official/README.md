# Portable official facility source pipeline

This directory is intended to live at `tools/call-sources/official/` inside the PMG checkout. It contains code, small audit manifests, and one small serialized municipal API snapshot. It does **not** contain downloaded ZIPs, vendored Python packages, generated candidates, or the stale business acquisition stage. Original session scripts remain unchanged outside this portable copy.

**Outputs are research candidates, not verified vehicle entrances.** A provider point can mark a building, parcel, campus, park asset, or approximate geocode. Polygon/MultiPoint representative points are not entrance locations. Same-address coordinate spreads over 200 m are flagged; they can indicate a large site, a subfacility, or a source error. Inspect coordinate discrepancies and establish legal vehicle access separately before using a site for a driving scenario. Structural validation does not establish current operation, entrance accuracy, routing suitability, or real incident eligibility.

## Setup and exact commands

Use Python 3.12. Run from the PMG repository root after copying this directory into `tools/call-sources/official/`:

```bash
python3 -m venv .venv-call-sources
.venv-call-sources/bin/python -m pip install -r tools/call-sources/official/requirements.txt
.venv-call-sources/bin/python tools/call-sources/official/acquire_snapshot.py --repo-root . --output-dir .cache/call-sources/official
.venv-call-sources/bin/python tools/call-sources/official/normalize_lode.py --repo-root . --output-dir .cache/call-sources/official
.venv-call-sources/bin/python tools/call-sources/official/refine_bundles.py --repo-root . --output-dir .cache/call-sources/official
.venv-call-sources/bin/python tools/call-sources/official/validate_bundles.py --repo-root . --output-dir .cache/call-sources/official
```

Every executable supports `--help`, `--repo-root`, `--output-dir`, and `--cache-dir` (alias `--cache`). Defaults are an auto-detected PMG checkout, `REPO/.cache/call-sources/official` for generated output, and `OUTPUT/cache` for downloaded inputs. `--repo-root` must contain `cities/city-registry.js`; city JSON/map bounds are read only. No pipeline step writes into `cities/` or updates runtime game data.

For an existing raw cache in a different directory, supply the same cache argument to **all four** commands. For example, verify the cache without accessing the network:

```bash
.venv-call-sources/bin/python tools/call-sources/official/acquire_snapshot.py --repo-root . --output-dir .cache/call-sources/official --cache-dir /path/to/existing/official-sources --offline
```

`acquire_lode.py` and `acquire_ontario_schools.py` are compatibility entry points that acquire only their respective groups. The complete pipeline needs `acquire_snapshot.py` with its default `--group all`. `--group additional` fetches cultural/municipal inputs only. `--offline` fails on missing/mismatched cache entries and never makes an HTTP request.

Acquisition verifies SHA-256 **and** size before using cached bytes. Valid cached downloads are reused, regardless of cache age, because this is a pinned snapshot rather than an automatic latest-data updater. Downloads use a temporary file and are promoted only after verification. An upstream file that has changed at a mutable URL fails checksum verification; review and record a new source snapshot explicitly instead of accepting it silently. The recreation GeoPackage and source CSV are extracted from their verified ZIP using fixed filenames; existing extractions are checked against ZIP size/CRC before reuse. Acquisition writes `acquisition-verification-{group}.json` into the output directory. HTTP/TLS use Python's normal configured proxy/trust path.

## Frozen source inputs and licences

`source-resources.json` is the exact resource manifest: source/catalogue/download URLs, SHA-256 hashes, byte sizes, snapshot dates, retrieval dates, licence URLs, and source CRS. `download-manifest.json` and `ontario-school-download-manifest.json` preserve acquisition timestamps used in candidate provenance. Retained timestamps describe the original snapshot acquisition; rerunning a cached pipeline does not falsely relabel the source as newly retrieved.

| Dataset | Snapshot/release | Coordinate basis | Published licence |
| --- | --- | --- | --- |
| Statistics Canada ODEF v3 | Released 2024-12-13; collection July–November 2024 | EPSG:4326 WKT points | Open Government Licence – Canada |
| Statistics Canada ODHF v2 | Released 2026-09-24; source collection 2025–2026 | EPSG:3347 GeoJSON, transformed to EPSG:4326 | Open Government Licence – Canada |
| Statistics Canada ODSRF v2 | Released 2026-09-24; source collection 2025–2026 | EPSG:3347 GeoPackage, transformed to EPSG:4326 | Open Government Licence – Canada |
| Statistics Canada ODCAF v1 | Source collection January–July 2020 | EPSG:4326 latitude/longitude | Open Government Licence – Canada |
| Ontario public school contact roster | September 2026 file; catalogue calls resource August 2026 | Addresses only; corroborates ODEF geometry | Open Government Licence – Ontario |
| Ontario private school contact roster | Retrieved 2026-10-29; resource does not state a snapshot date | Addresses only; corroborates ODEF geometry | Open Government Licence – Ontario |
| Ontario private school location list | Academic year 2025–2026; retrieved 2026-10-29 | Direct EPSG:4326 latitude/longitude | Open Government Licence – Ontario |
| Thunder Bay municipal facilities | Retrieved 2026-10-29; exact request time not recorded | Source layer EPSG:3160; ArcGIS query `outSR=4326` | Open Data Licence – The Corporation of the City of Thunder Bay |

These named licences allow commercial reuse with their attribution conditions. Candidate records retain licence and attribution information. The small `thunder-bay-facilities-features.json` snapshot is included because the original discovery response was parsed and serialized, and a live ArcGIS response can change both contents and byte serialization. Its manifest records the actual upstream query and exact bundled-byte checksum. Cultural retrieval was recorded to date precision only; an exact request time is not invented.

Primary licence links:

- https://open.canada.ca/open-government-licence-canada
- https://www.ontario.ca/page/open-government-licence-ontario
- https://www.thunderbay.ca/city-hall/thunder-bay-open-data/

Explicit exclusions: Ontario GeoHub School Facility's OGDE metadata limits use to professional/non-commercial purposes; direct Belleville GIS had no established commercial open licence; ODBus data had stale 2022 source records and observed geocoding errors. None are in this portable final pipeline. Childcare address-only enrichment from the session is outside this pipeline because the provincial data lacks coordinates; this pipeline never geocodes it by guessing.

## Output contract and checks

- `normalized/{cityId}.json`: intermediate official facility candidates, with original attributes and provider source-registry matches. These matches can identify multiple provider datasets; the exact LODE downloaded record ID remains the precise reproducible locator.
- `facility-core/{cityId}.json`: compact unmerged candidates.
- `facility-provenance/{cityId}.json`: full source attributes. `mergedSourceRecordIds` in selected sites resolve here.
- `site-deduped/{cityId}.json`: one selected record per normalized civic address within a city, merging subfacilities/tenants at that address. This intentionally reduces site counts; alternative names and source IDs remain available.
- `site-deduped/summary.json`: city/category coverage.
- `current-school-address-conflicts.json`: ODEF/current-roster address disagreements excluded from final candidates.
- `same-address-coordinate-conflicts.json`: same-address source-coordinate spreads over 200 m.
- `bundle-validation.json`: contract/numeric/source-URL checks, not entrance or operational verification.

Required candidate fields are `id`, `cityId`, `name`, `addr`, `lat`, `lng`, `category`, `dataset`, `sourceFeatureId`, `datasetRecordId`, `sourceUrls`, `retrievedAt`, `licence`, `coordinateMethod`, `cityMatchBasis`, and `reviewFlags`. `sourceFeatureId` may be null when the upstream provider did not supply one; `datasetRecordId` identifies the exact downloaded record. `verifiedcurrentness`, when present, describes the specific check performed rather than asserting universal currentness.

The original city metadata produced 29,455 unmerged candidates and 18,415 unique city/address sites across 32 non-Peterborough cities, including 4,211 selected school sites with current-roster/direct-location corroboration. Counts can change when repository city bounds or source-selection logic change. Preserve the repository revision alongside a reproduction run when comparing counts.

## Flag and geometry semantics

- `source-currentness-not-individually-checked`: publication/retrieval is known; individual current operation was not checked.
- `school-roster-current-address-confirmed-coordinate-source-2024`: school number and normalized address match the current provincial roster, but coordinates remain from 2024 ODEF. Matching neither re-geocodes the site nor verifies its entrance.
- `not-matched-to-2026-school-roster`: no roster match was established; retained as an older sourced candidate requiring review. A known changed address is excluded instead.
- `self-reported-private-school-location`: coordinate/address from the official 2025–2026 private-school location list; physical-location rows retained and online-only rows excluded.
- `source-data-2020-currentness-review-required`: cultural data is old and requires current corroboration.
- `geometry-representative-point-not-entrance`: a source Polygon/MultiPoint was converted to a deterministic representative point after CRS conversion. It is not an entrance.
- `same-address-source-coordinate-conflict-over-200m`: merged sources at the same normalized address spread over 200 m; inspect the site rather than treating the selected point as verified.
- `scarborough-game-rectangle-not-legal-boundary`: a Toronto CSD record falls inside the legacy Scarborough game rectangle; that rectangle is not a legal municipal/district boundary.
- `facility-service-type-needs-classification`: municipal facility name/address is sourced but its category needs classification.
- `cross-streets-not-derived` / `district-not-derived`: no cross streets/district were asserted. They must be sourced separately.

City assignment generally requires the LODE census subdivision plus existing game bounds. Fresh private-school rows use official locality plus game bounds. Civic-address normalization expands a fixed set of street/direction abbreviations, strips punctuation, and uses the part before a comma. It is recorded deduplication/corroboration, not invented street naming. This process does not perform nearest-road snapping, entrance inference, district guessing, emergency-base updates, or difficulty allocation.

## Verification performed

All seven executable entry points passed `--help`; all nine Python modules parsed successfully. The full pinned cache was verified with `--offline` (no new data requests), and normalization → refinement → validation ran from `/tmp` using explicit repo/output/cache paths. All stages exited 0 and reproduced 18,415 unique city/address sites with no contract errors. `portable-verification.json` and `pipeline-verification.json` record these checks. The installed dependency directory used for the session check is not part of this package.

## Independent source reviews

`independent-source-reviews.json` is a versioned evidence sidecar keyed by stable candidate ID. The release sidecar contains 70 reviews: 64 selected priority samples across all 32 cities, four additional issue/alias checks, and two targeted Toronto corroborations. It records 60 corroborations, three semantic corrections, five rejected name/address/current-operation associations, and two unresolved associations. The Belleville 490 Sidney follow-up identifies Home for Good Supportive Housing with CMHA among its on-site agencies. This is a purposeful review sample, not a statistical accuracy estimate.

Normalization and refinement automatically call `official_reviews.apply_review`. `apply_independent_reviews.py` applies the same sidecar to existing `normalized/`, `facility-core/`, `facility-provenance/`, and `site-deduped/` outputs without downloading or rebuilding raw data:

```bash
.venv-call-sources/bin/python tools/call-sources/official/apply_independent_reviews.py --repo-root . --output-dir .cache/call-sources/official
```

Each reviewed row gains `independentSourceReview:{status,reason,sourceUrls,retrievedAt,...}`. Rejected rows gain the exact flag `independent-source-review-rejected`; they remain in source audit output so the downstream catalogue builder can reject them with evidence. Unresolved rows gain `independent-source-review-unresolved`. Corroborated/corrected rows gain explicit independent `verifiedcurrentness` evidence, preserving previous school-roster evidence when present. Corrected names preserve previous names in `aliases`. A campus-address alias can be disclosed without relocating a point.

Only `name` and `category` semantic changes are allowed by this sidecar processor. It cannot change a candidate's civic address or coordinates. Original source attributes and original displayed name/address/category remain available for audit. Confirmed relocations or closed sites are quarantined instead of assigning an unverified replacement point. Independent name/address corroboration does not remove coordinate-spread or entrance limitations, and a downstream builder must continue to enforce those checks.

The complete sidecar includes five OSM-only corroborated IDs that do not occur in official facility output. It is safe to apply to multiple source owners: unmatched IDs do nothing. No OSM source records or production files are edited by the official-source pipeline.

`release-verification.json` records the final portable syntax/help checks and the 70-row sidecar hash. Earlier pipeline verification files describe their original snapshot runs; their counts do not claim a fresh full pipeline or route/browser audit after every semantic follow-up.
