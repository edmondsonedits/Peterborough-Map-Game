# Offline OSM civic-source acquisition

This pipeline acquires explicit civic addresses and source geometries from one cached Geofabrik Ontario OpenStreetMap PBF. It produces city-specific source pools and candidate bundles for the game's independent canonical-location builder. It is a research/build input, not a runtime API dependency.

Install `requirements.txt` in a Python3 environment. Acquisition commands accept explicit `--repo` and `--cache` paths, so no developer workspace path is embedded in their implementation. Archive helper arguments are documented below.

```sh
python -m pip install -r requirements.txt
python acquire_osm.py --repo /path/to/game --cache /path/to/osm-cache --download
```

`--download` downloads the ~1GB Ontario PBF only when the cache file does not already exist. No download occurs without the flag. Existing cached files are never refreshed implicitly. The mutable download URL is `https://download.geofabrik.de/north-america/canada/ontario-latest.osm.pbf`; the PBF embedded replication timestamp, byte length and SHA256 identify the actual source snapshot. HTTP download metadata is cached separately when this CLI performs the download.

For an existing acquired cache, regenerate or validate only the needed steps:

```sh
python acquire_osm.py --repo /path/to/game --cache /path/to/osm-cache --steps normalize major-roads validate
python acquire_osm.py --repo /path/to/game --cache /path/to/osm-cache --steps validate
```

`--pbf /path/to/cached-ontario.osm.pbf` selects an existing PBF for extraction. Default steps, in order, are `extract normalize entrances major-roads validate`. Extraction requires several GB of working memory/storage and writes a disposable node-location index while assembling geometries; the index is deleted when extraction completes. Keep raw civic elements, source metadata and the selected boundary file to reproduce downstream normalization without rereading the province PBF.

Individual acquisition utilities expose the same `--repo`/`--cache` arguments. `major_road_supplements.py` also accepts `--cities ajax pickering` and `--limit 2000`. The driver handles all configured cities.

## Source and license

Data attribution: © OpenStreetMap contributors, https://www.openstreetmap.org/copyright.

License: Open Database License 1.0, https://opendatacommons.org/licenses/odbl/1-0/. Preserve attribution and applicable share-alike requirements when redistributing the derived database. Exact OSM object IDs, object versions/timestamps, per-object URLs, raw tags and geometries are retained. Geofabrik download page: https://download.geofabrik.de/north-america/canada/ontario.html.

The 2026-10-29 acquisition used embedded snapshot `2026-10-28T21:21:02Z`, replication4955, SHA256 `4d53c536cd90335cd051190c23493218e002a3314d9b20a227e1a8ee15463273`, 1,032,663,471 bytes. Future acquisitions must use their own recorded metadata, not this historical checksum.

## Outputs and acceptance boundaries

- `raw/civic-elements.jsonl`: explicit `addr:housenumber` + `addr:street` nodes and ways. No interpolated or invented civic numbers.
- `raw/municipal-boundaries.geojson`: assembled OSM administrative polygons matching configured cities.
- `bundles/selected-boundaries.geojson`: exact selected city polygons. Niagara Falls, NY and a Guelph sub-boundary are excluded. Scarborough is a former municipality/postal scope inside Toronto; these configured game scopes intentionally overlap.
- `bundles/<city>.jsonl`: complete civic-source pool inside the source municipal polygon, with ranges/lists/inactive sites and explicitly conflicting configured-municipality tags withheld.
- `bundles/<city>.candidates.json`: up to1,500 named sites plus1,500 ordinary exact civic points, with ordinary candidates thinned by street/grid then deterministically sampled to avoid source-ID geographic bias.
- `bundles/<city>.major-road-candidates.json`: up to2,000 additional exact civic candidates whose source street name matches a named public ground-level packaged primary/secondary street. Compass direction tokens are retained. One candidate per street/~100m cell and round-robin selection across streets limit runs of adjacent houses. Previously unselected and named sites are preferred. No coordinates are changed or roadway classes invented. The production builder still must independently establish the actual matching segment, public access, road gap and arrival side.
- `bundles/<city>.entrances.json`: source-mapped entrance nodes associated with exact shortlisted building footprints. These can be pedestrian building entrances; public vehicle access is explicitly unverified. Private/no-access entrances are omitted.
- `coverage.json`, `major-road-coverage.json`, `entrance-coverage.json`: source acquisition counts, distinct civic strings and source caveats. They do not establish accepted gameplay counts or station coverage.
- `validation.json`, `major-road-validation.json`: exhaustive candidate schema, exact civic-source equality, unique IDs/civic strings, coordinate/source-geometry consistency, strict selected municipal polygon membership, object URL identity, ODbL/checksum retention and explicit access uncertainty.

Municipal membership does not establish Fire or EMS response districts. OSM tags are community-maintained source evidence, not independent official confirmation. Source building interior points are not asserted entrances or arrivals. Cross streets, navigation difficulty, reachable intended-side access, production-road snapping and station response assignments remain the canonical builder/reviewer's responsibility.

Barrie's source boundary explicitly warns that its north edge needs updating; this warning is propagated. Scarborough's former-boundary note is retained. Postal aliases remain in source tags; municipal membership is established separately by geometry.

Large bulk acquisition uses one cached extract rather than repeated per-object queries to volunteer Overpass instances. See the documented commons guidance: https://dev.overpass-api.de/overpass-doc/en/preface/commons.html.

## Versioned independent currentness reviews

`independent-source-reviews.json` retains selected official/operator corroboration by canonical source ID. `osm_reviews.py` applies this evidence during normalization and major-road generation. `apply_osm_reviews.py --cache /path/to/cache` applies it atomically to already-generated shortlist files. Reviews may change only supported names/categories and review flags; source coordinates and civic strings are explicitly protected. Review dates remain visible and must be refreshed when repeating acquisition for a substantially later snapshot. No broad claim of independent official verification is inferred for unreviewed OSM sites.

## Targeted Toronto enrichment

`target_toronto_candidates.py --repo /path/to/game --cache /path/to/osm-cache` mines the complete existing Toronto civic pool for Station51 within1.5km and Island sites within300m of the exact33 approved emergency-access ways. It writes a separate `toronto.targeted-candidates.json` plus coverage report. It preserves exact civic strings/tags/geometry and only adds selection-purpose evidence; no ownership, vehicle-entry claim or road connection is inferred. Canonical and route builders must independently validate approved-way membership, arrival approach and directed ownership.

## Exact reviewed targeted evidence archives

`reviewed-targets/` preserves six deliberately small reviewed source bundles: 3,294 candidate rows in 342,539 compressed bytes. These are candidate evidence, **not** 3,294 accepted locations or runtime calls. All source geometry, civic strings, tags, selection-purpose proofs and historical metadata—including historical scratch path labels—remain byte-identical inside the archives. Historical path labels are evidence, not CLI runtime inputs. No province PBF, full civic JSONL, source cache, dependencies or node index is bundled. These files are build/review inputs outside the runtime download/package URLs.

Compression uses level 9, an empty gzip filename and `mtime=0`. [`reviewed-targets/manifest.json`](reviewed-targets/manifest.json) records each original filename/count, exact uncompressed and gzip SHA256/size, ODbL license, attribution and original acquisition provenance. The archive helper verifies both compressed bytes and restored original bytes before restoring. Do not reformat or remove metadata from an exact restored bundle.

| Original JSON filename | Candidate rows | Exact uncompressed SHA256 |
|---|---:|---|
| `greater-sudbury.rural-targeted-candidates.json` | 6 | `9cf5a4ac54b2124a3ca297023d6062c49a8de5531451118a325149ed575d78a8` |
| `ottawa.rural-targeted-candidates.json` | 6 | `c2e2b4d6c908af3e46db4f97b5fc2f1f694e89fb4da3dae9655742f48cfca6a2` |
| `ottawa63.final-gap-targeted-candidates.json` | 12 | `ca2dbfda3b5badb80561aed2293e65a2fb4bd110184dc9402c6bf90dbe39804f` |
| `toronto.final-mainland-route-shortlist-candidates.json` | 24 | `5341c3c0b01e2bca0ed643e3401a51e171e42b095511efb19fba883739e11d9d` |
| `toronto.targeted-candidates.json` | 3210 | `a6b55487acdbbaad22e666021d3c3265ed8419dd93a712045c36df9a6c9e2120` |
| `toronto.three-gap-route-shortlist-candidates.json` | 36 | `235e446a1503c69fa0c47b0e89021bc2ec002c1b5e3f607a1bb9397b9027f31b` |

The original `toronto.targeted-candidates.json` must retain SHA256 `a6b55487acdbbaad22e666021d3c3265ed8419dd93a712045c36df9a6c9e2120` for the reviewed Island source policy. That source review did not establish route acceptance: **seven proposed isolated Island civic routes were rejected as disconnected/unreachable**. No mainland link or artificial connection was added. Existing approved ways, actual clues and source-point/approach distinctions remain separate evidence.

### Verify, restore and export exact bytes

Run from the repository root; only the Python standard library is needed for these archive commands:

```sh
python tools/call-sources/osm/reviewed_targets.py verify
python tools/call-sources/osm/reviewed_targets.py restore --output-dir /path/to/restored-targets
python tools/call-sources/osm/reviewed_targets.py restore --output-dir /path/to/restored-targets --bundle toronto.targeted-candidates.json
```

`restore` refuses to replace a different existing file unless `--force` is explicit. `--archive-dir` selects a different archive directory for `export`, `verify` or `restore`. Export accepts repeated `--input` arguments; each input's bytes are preserved, rather than JSON-parsed/reformatted for storage:

```sh
python tools/call-sources/osm/reviewed_targets.py export --archive-dir /path/to/new-archive --review-date 2026-10-29 --input /path/to/reviewed-a.json --input /path/to/reviewed-b.json
```

### Multiple inputs and the actual canonical builder interface

`tools/build-city-call-locations.cjs` accepts repeated `--targeted-file FILE` flags in one invocation. A single explicit file still overrides automatic input; without the flag it reads `<osm-dir>/<city>.targeted-candidates.json`. Restore gzip files before passing them to the builder. Per-file basename, actual SHA256 and selection purpose are retained in each accepted record's `sourceInputFiles` provenance. Repeated source IDs with identical factual fields deduplicate while preserving file evidence; conflicting source facts are rejected.

For the current 735-record Toronto catalogue, the original 3,210-row source bundle and both mainland shortlists (36 and 24) belong in **one builder run**. Keep each original file byte-identical. Only the supplied file whose actual SHA256 matches `--reviewed-island-bundle-sha256` grants the reviewed Island context to its own records; the other files remain ordinary targeted inputs. A requested checksum that matches no supplied file fails. Neither concatenating JSON nor a separate Island-only invocation preserves this complete input set.

Run from the repository root after restoring the six archives:

```sh
node tools/build-city-call-locations.cjs --city toronto --official-dir /path/to/official-cache/site-deduped --osm-dir /path/to/osm-cache/bundles --targeted-file /path/to/restored-targets/toronto.targeted-candidates.json --targeted-file /path/to/restored-targets/toronto.three-gap-route-shortlist-candidates.json --targeted-file /path/to/restored-targets/toronto.final-mainland-route-shortlist-candidates.json --reviewed-island-bundle-sha256 a6b55487acdbbaad22e666021d3c3265ed8419dd93a712045c36df9a6c9e2120 --output-dir /path/to/scratch-toronto-catalogue
```

Recorded end-to-end replay of that exact three-file command preserved all 735 current Toronto IDs and exact coordinates: zero missing/moved records and zero targeted provenance SHA omissions. The scratch result contained 767 proposed source selections and was not promoted as a production replacement. The canonical interface's 27 focused tests also passed. These results establish this frozen-input replay, not future-snapshot route acceptance.

Ottawa's two reviewed inputs likewise can be supplied directly in one run, without merging source bytes:

```sh
node tools/build-city-call-locations.cjs --city ottawa --official-dir /path/to/official-cache/site-deduped --osm-dir /path/to/osm-cache/bundles --targeted-file /path/to/restored-targets/ottawa.rural-targeted-candidates.json --targeted-file /path/to/restored-targets/ottawa63.final-gap-targeted-candidates.json --output-dir /path/to/scratch-ottawa-catalogue
```

The Greater Sudbury rural bundle can be passed directly as that city's single `--targeted-file`. A complete canonical regeneration still needs the normal official/OSM candidate caches and `selected-boundaries.geojson`; these six targeted archives are additional evidence, not replacements for the larger source pools. Preserve current `training-data.json` shared IDs/points and `call-provenance.json` evidence, compare them against regeneration, promote only reviewed accepted additions, then regenerate and audit directed calls using the repository response tools. Source acceptance alone does not establish route acceptance, and these commands write scratch catalogues rather than production data.

The archive helper's optional `combine` command remains useful for a derived **non-Island** research input. It preserves each candidate row, refuses conflicting duplicate IDs and checks source coordinates against matching current canonical records when `--current-training` is provided. It does not invent raw geometry from runtime records. A combined file gets a new checksum and is not the original reviewed Island file; direct repeated flags above are the preservation workflow.

```sh
python tools/call-sources/osm/reviewed_targets.py combine --city ottawa --input /path/to/restored-targets/ottawa.rural-targeted-candidates.json --input /path/to/restored-targets/ottawa63.final-gap-targeted-candidates.json --current-training cities/ottawa/training-data.json --output /path/to/derived-ottawa-research-input.json
```

`combine` refuses Island rows unless `--exclude-island` explicitly removes them for a mainland-only derived file. Do not pass a combined file with the original Island checksum. Archive content inspection found no credential fields/patterns, authenticated/signed query parameters or absolute scratch paths. Historical relative `call-session` report labels occur only in selection-purpose evidence; the proofs are embedded and the builder does not open those labels. Normal explicit repository/cache inputs remain required.

### Configurable bounded source mining

`mine_targeted_candidates.py` makes the later station-gap method reusable with explicit repository/cache/city/base/exclusion/output arguments. It reads only cached city JSONL, optionally restricts Fire sources to existing exact station-code polygons, withholds inactive/conflicting/duplicate civics, and limits each base to 100 raw candidates (or a smaller explicit limit). It adds selection-purpose metadata without moving source points or inventing numbers/roads. It does not perform access, clue, directed ownership, finish or onward validation. In a modeled area with no polygon, geographic proximity is only research selection; it is not first-due evidence.

```sh
python tools/call-sources/osm/mine_targeted_candidates.py --repo /path/to/game --cache /path/to/osm-cache --city ottawa --base-id ottawa-fire-63 --training-file /path/to/current-training.json --exclude-candidates /path/to/current-accepted-candidates.json --limit 50 --radius-metres 2000 --output-dir /path/to/scratch-candidates
```

Repeat `--base-id` and `--exclude-candidates` as needed. Distances, limits, current exclusion sets and actual source snapshots determine the new shortlist. This reusable CLI does not claim to regenerate the historical reviewed source bytes; restore the frozen archives for that purpose. The earlier `target_toronto_candidates.py` remains the configurable original Station51/approved-Island source miner. Do not run either miner to refresh an exact reviewed archive implicitly.
