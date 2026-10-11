# Deterministic road review tracker rebuild

This is a new implementation based on `f8818548ad903b14b22ee5a48a88f3abcd92f582`. Lost implementation bytes and the old 208-row ledger were not recovered. The complete queue is reproducible from the persisted audit and the explicitly scoped evidence ledger.

## Inventory and evidence coverage

- 5,961 rendered ways in `road-review-queue.json` and `road-review-queue.csv`
- 232 raw source conflicts remain unresolved: 132 pass the compatibility gate for further numeric review, 100 require compatibility-first review
- 91 documentary ledger entries: four persisted Sherbrooke paint reviews, two freshly inspected historical Medical/Hospital profiles, twelve retained Lansdowne manual observations, and 73 retained Chemong/Parkway contact-sheet observations
- 5,870 ways have no curated ledger entry and are explicitly `unreviewed`
- Zero ways are certified as current conditions; zero source conflicts are resolved

`ledgerPresent` means a documentary record is present. `reviewCoverage` describes the kind of evidence, not completion of a whole-road visual audit. `flagged: false` is never synonymous with reviewed, accurate, or safe for training. Uncurated rows are flagged when their raw status is a lane-count conflict; other uncurated rows remain explicitly unreviewed even when not flagged. All raw audit records, including OSM tags, ORN lane values, effective timestamps, match quality and compatibility categories, are copied unchanged into `auditEvidence`.

The retained counts of 99 Lansdowne and 103 Chemong/Parkway inventory entries included automated classifications and numeric-agreement rows, not 202 manual visual inspections. Only the recoverable prior observations are represented as documentary reviews. See `recovery/LANSDOWNE-HISTORICAL-OBSERVATIONS.md` and `recovery/DIVIDED-ROAD-HISTORICAL-OBSERVATIONS.md`. Original images, contact sheets and receipt binaries remain unavailable. Lansdowne source-request URLs are reconstructed from the stated recipe and base geometry, not recovered byte-identical receipts. Divided-road extents/hashes are unknown and not fabricated.

The rebuild has not re-inspected those original image pixels. Historical imagery does not prove present-day paint or resolve OSM/ORN semantic conflicts. ORN effective dates are record timestamps, not survey dates. Parkway `33947868` remains evidence-only: count interpretation and exact buffer/paint placement do not justify a numeric or runtime change. Historical construction reports are not refreshed traffic guidance or authorization to change routing.

## Reproduce and fail closed

Run:

- `python tools/build_road_review_tracker.py`
- `python tools/build_road_review_tracker.py --check`
- `python tools/test_road_review_tracker.py`

Generation uses no network and no wall-clock timestamp. JSON sorting, numeric way-ID ordering and CSV line endings are deterministic. The JSON records SHA-256 of the audit bytes, ledger bytes and generator itself. It also checks all source/evaluator hashes declared by the audit against actual files. Normal generation reports any drift in both stdout and JSON; `--check` fails on drift or stale/missing JSON/CSV artifacts. It never silently certifies stale inputs. Regenerate the upstream audit after integrated source/evaluator changes, then validate the ledger and regenerate the queue.

Duplicate audit IDs, duplicate/unknown ledger IDs, invalid evidence metadata, current-condition certification and stale `expectedAudit` fields fail generation. Each curated entry pins raw count/compatibility expectations and includes source URLs, review date, acquisition uncertainty, confidence basis and a next check. Rows with changed expectations require real evidence reconciliation; do not simply update them to make checks green. CSV uses standard quoting plus apostrophe-prefix escaping for formula/control-character cells; JSON preserves exact raw strings.

## Integration boundary

No geographic source, lane database, routing, vehicle physics or paint runtime file is modified by the tracker. The four persisted Sherbrooke entries retain their prior bounded interpretation. Medical and Hospital carry fresh historical profile evidence, partial coverage and explicit current-condition uncertainty. Hospital's fresh profile is partial: measured yellow turn boundaries at 10–90 m of its approximately 118 m way. Medical's source span is 46.253885771 m in the actual app projection; only its measured yellow taper and generalized inset hatches are represented. Both profiles are in the ledger with verification status, rather than implying full appearance is complete. White markings, arrows and stop bars are not implied by these partial measurements. Final integrated app/cache/CI/audit generation and implementation-status verification belong to the integration pass.
