# City call coverage — 2026-10-29

**FINAL inventory**, captured 2026-10-29T06:42:09.340Z; release 1.6.151; working-tree inputs identified by SHA-256 in [the JSON ledger](city-call-coverage-2026-10-29.json). Baseline 2026-10-29T03:30:35.086Z, revision `384d0973dbaff384709ac0e34f542c8dda84f574`, release 1.6.150. Frozen-data inventory snapshot; this report does not certify final routing or browser behavior.

Declared modes: **33 Geo**, **33 Route Mapping**, and **7 mission cities** (6 on-scene/no-transport; 1 hospital-transport workflow). These are inspected capability flags, not final mission/browser results.

Canonical locations: **800 → 7882** city-scoped unique IDs. Selectable bases: **606 → 622** (411 Fire, 211 EMS). Published route assignments: **3630 → 8118**, representing **6111** city-scoped unique route source groups. These are separate measures.

EMS enrichment adds **329** unmatched EMS-only care-home locations; **0** canonical sites are marked care homes. Care-home priority/recognition overrides are separate from raw recognition tiers.

Before → current deficits: **3642 → 46** distinct local destinations to the 12/base target (7 bases), **3636 → 40** new first-due destinations to 6/base (7 bases), and **0 → 0** below the 3/base floor (0 bases). A zero total deficit does not establish route verification.

The all-base deficit totals include Peterborough's unchanged six/base reference: 30 total-target and 30 new-first-due stretch deficits. These are not expansion failures. Excluding Peterborough, expansion deficits are 16 / 10 / 0 (total12 / newFD6 / floor3).

## City recognition catalogues

Raw Geo plus shared-location canonical union; E/M/H means recognition metadata. EMS-only additions are excluded here. Multiple base assignments do not increase this count.

| City | Canonical IDs before → after | Raw Geo + shared rows | Recognition E/M/H before → after | EMS-only additions | Fire / EMS bases |
|---|---:|---:|---|---:|---:|
| Peterborough | 200 → 200 | 200 + 0 | 100/50/50 → 100/50/50 | 5 | 3 / 2 |
| Oshawa | 20 → 204 | 20 + 184 | 10/5/5 → 102/52/50 | 5 | 6 / 2 |
| Belleville | 0 → 202 | 0 + 202 | 0/0/0 → 100/52/50 | 4 | 5 / 2 |
| Scarborough | 0 → 229 | 0 + 229 | 0/0/0 → 111/64/54 | 20 | 17 / 12 |
| Pickering | 20 → 204 | 20 + 184 | 10/5/5 → 101/53/50 | 2 | 5 / 2 |
| Markham | 20 → 208 | 20 + 188 | 10/5/5 → 100/58/50 | 5 | 9 / 6 |
| Toronto | 20 → 757 | 20 + 737 | 10/5/5 → 279/385/93 | 80 | 84 / 49 |
| Ajax | 20 → 200 | 20 + 180 | 10/5/5 → 100/50/50 | 3 | 3 / 1 |
| Barrie | 20 → 210 | 20 + 190 | 10/5/5 → 103/56/51 | 9 | 6 / 2 |
| Brampton | 20 → 207 | 20 + 187 | 10/5/5 → 101/55/51 | 11 | 14 / 9 |
| Brantford | 20 → 205 | 20 + 185 | 10/5/5 → 101/53/51 | 4 | 4 / 3 |
| Burlington | 20 → 202 | 20 + 182 | 10/5/5 → 100/52/50 | 9 | 8 / 4 |
| Cambridge | 20 → 205 | 20 + 185 | 10/5/5 → 102/52/51 | 8 | 6 / 3 |
| Chatham-Kent | 20 → 256 | 20 + 236 | 10/5/5 → 138/57/61 | 7 | 19 / 6 |
| Clarington | 20 → 207 | 20 + 187 | 10/5/5 → 100/54/53 | 2 | 5 / 2 |
| Greater Sudbury | 20 → 234 | 20 + 214 | 10/5/5 → 109/64/61 | 7 | 18 / 12 |
| Guelph | 20 → 209 | 20 + 189 | 10/5/5 → 102/53/54 | 4 | 6 / 2 |
| Hamilton | 20 → 289 | 20 + 269 | 10/5/5 → 142/73/74 | 26 | 26 / 18 |
| Kingston | 20 → 217 | 20 + 197 | 10/5/5 → 104/56/57 | 5 | 10 / 4 |
| Kitchener | 20 → 212 | 20 + 192 | 10/5/5 → 101/57/54 | 7 | 7 / 3 |
| London | 20 → 218 | 20 + 198 | 10/5/5 → 104/62/52 | 16 | 15 / 7 |
| Milton | 20 → 202 | 20 + 182 | 10/5/5 → 101/51/50 | 1 | 5 / 4 |
| Mississauga | 20 → 279 | 20 + 259 | 10/5/5 → 135/81/63 | 16 | 23 / 13 |
| Niagara Falls | 20 → 203 | 20 + 183 | 10/5/5 → 100/53/50 | 6 | 7 / 2 |
| Oakville | 20 → 207 | 20 + 187 | 10/5/5 → 101/55/51 | 5 | 9 / 4 |
| Ottawa | 20 → 478 | 20 + 458 | 10/5/5 → 197/208/73 | 27 | 45 / 20 |
| Richmond Hill | 20 → 202 | 20 + 182 | 10/5/5 → 101/50/51 | 5 | 6 / 2 |
| St. Catharines | 20 → 204 | 20 + 184 | 10/5/5 → 103/51/50 | 1 | 6 / 2 |
| Thunder Bay | 20 → 207 | 20 + 187 | 10/5/5 → 102/55/50 | 6 | 8 / 4 |
| Vaughan | 20 → 207 | 20 + 187 | 10/5/5 → 100/54/53 | 7 | 10 / 4 |
| Waterloo | 20 → 205 | 20 + 185 | 10/5/5 → 101/52/52 | 3 | 4 / 1 |
| Whitby | 20 → 205 | 20 + 185 | 10/5/5 → 100/55/50 | 3 | 5 / 1 |
| Windsor | 20 → 208 | 20 + 188 | 10/5/5 → 102/55/51 | 10 | 7 / 3 |

## City/service route assignments

FD/S/legacy are explicit first-due, explicit support and unlabelled legacy assignment roles. New-FD counts only explicit first-due IDs absent from the baseline. Distances summarize published metrics, not newly calculated routes. The JSON contains every base’s point, evidence URLs, assignment method, before/after counts, score bins, legacy decision counts, deficits, IDs and ineligible records.

| City / service | Assignments before → after | Unique source groups | FD / support / legacy | New FD | Deficit total12 / newFD6 / floor3 | Score bins 0–33 / 34–66 / 67–100 | Recorded median / max m |
|---|---:|---:|---:|---:|---:|---:|---:|
| Peterborough / FIRE | 18 → 18 | 18 | 0 / 0 / 18 | 0 | 18 / 18 / 0 | 0 / 0 / 0 | 1,905 / 2,655 |
| Peterborough / EMS | 12 → 12 | 12 | 0 / 0 / 12 | 0 | 12 / 12 / 0 | 0 / 0 / 0 | 1,707 / 2,626 |
| Oshawa / FIRE | 36 → 84 | 72 | 36 / 12 / 36 | 36 | 0 / 0 / 0 | 8 / 15 / 25 | 1,695 / 4,588 |
| Oshawa / EMS | 12 → 24 | 24 | 12 / 0 / 12 | 12 | 0 / 0 / 0 | 1 / 2 / 9 | 1,378 / 2,860 |
| Belleville / FIRE | 30 → 66 | 60 | 30 / 6 / 30 | 30 | 0 / 0 / 0 | 9 / 13 / 14 | 1,787 / 6,193 |
| Belleville / EMS | 12 → 24 | 24 | 12 / 0 / 12 | 12 | 0 / 0 / 0 | 2 / 4 / 6 | 1,669 / 3,005 |
| Scarborough / FIRE | 36 → 238 | 204 | 102 / 34 / 102 | 102 | 0 / 0 / 0 | 22 / 53 / 61 | 1,709 / 4,659 |
| Scarborough / EMS | 36 → 144 | 144 | 72 / 0 / 72 | 72 | 0 / 0 / 0 | 13 / 32 / 27 | 1,680 / 3,767 |
| Pickering / FIRE | 30 → 68 | 60 | 30 / 8 / 30 | 30 | 0 / 0 / 0 | 7 / 12 / 19 | 1,850 / 5,278 |
| Pickering / EMS | 12 → 24 | 24 | 12 / 0 / 12 | 12 | 0 / 0 / 0 | 2 / 2 / 8 | 1,874 / 5,649 |
| Markham / FIRE | 54 → 126 | 107 | 54 / 18 / 54 | 54 | 0 / 0 / 0 | 8 / 28 / 36 | 1,777 / 5,234 |
| Markham / EMS | 36 → 72 | 72 | 36 / 0 / 36 | 36 | 0 / 0 / 0 | 8 / 11 / 17 | 1,739 / 4,919 |
| Toronto / FIRE | 501 → 1166 | 1000 | 499 / 166 / 501 | 499 | 8 / 5 / 0 | 194 / 248 / 223 | 1,603 / 3,577 |
| Toronto / EMS | 291 → 580 | 580 | 295 / 0 / 285 | 295 | 8 / 5 / 0 | 83 / 115 / 97 | 1,638 / 5,173 |
| Ajax / FIRE | 18 → 42 | 36 | 18 / 6 / 18 | 18 | 0 / 0 / 0 | 3 / 12 / 9 | 1,771 / 4,384 |
| Ajax / EMS | 6 → 12 | 12 | 6 / 0 / 6 | 6 | 0 / 0 / 0 | 3 / 1 / 2 | 2,007 / 4,589 |
| Barrie / FIRE | 36 → 84 | 72 | 36 / 12 / 36 | 36 | 0 / 0 / 0 | 10 / 16 / 22 | 1,752 / 4,526 |
| Barrie / EMS | 12 → 24 | 24 | 12 / 0 / 12 | 12 | 0 / 0 / 0 | 6 / 0 / 6 | 1,659 / 3,726 |
| Brampton / FIRE | 84 → 196 | 167 | 84 / 28 / 84 | 84 | 0 / 0 / 0 | 22 / 39 / 51 | 1,873 / 5,405 |
| Brampton / EMS | 54 → 108 | 108 | 54 / 0 / 54 | 54 | 0 / 0 / 0 | 11 / 19 / 24 | 1,787 / 5,006 |
| Brantford / FIRE | 24 → 56 | 48 | 24 / 8 / 24 | 24 | 0 / 0 / 0 | 9 / 12 / 11 | 1,698 / 4,498 |
| Brantford / EMS | 18 → 36 | 36 | 18 / 0 / 18 | 18 | 0 / 0 / 0 | 1 / 4 / 13 | 1,964 / 4,436 |
| Burlington / FIRE | 48 → 110 | 96 | 48 / 14 / 48 | 48 | 0 / 0 / 0 | 5 / 25 / 32 | 1,727 / 4,902 |
| Burlington / EMS | 24 → 48 | 48 | 24 / 0 / 24 | 24 | 0 / 0 / 0 | 5 / 10 / 9 | 1,748 / 3,860 |
| Cambridge / FIRE | 36 → 84 | 72 | 36 / 12 / 36 | 36 | 0 / 0 / 0 | 19 / 16 / 13 | 1,663 / 4,274 |
| Cambridge / EMS | 18 → 36 | 36 | 18 / 0 / 18 | 18 | 0 / 0 / 0 | 5 / 3 / 10 | 2,536 / 6,364 |
| Chatham-Kent / FIRE | 114 → 240 | 228 | 114 / 12 / 114 | 114 | 0 / 0 / 0 | 45 / 32 / 49 | 1,665 / 6,176 |
| Chatham-Kent / EMS | 36 → 72 | 72 | 36 / 0 / 36 | 36 | 0 / 0 / 0 | 21 / 6 / 9 | 1,403 / 5,603 |
| Clarington / FIRE | 30 → 60 | 60 | 30 / 0 / 30 | 30 | 0 / 0 / 0 | 4 / 11 / 15 | 1,693 / 4,119 |
| Clarington / EMS | 12 → 24 | 24 | 12 / 0 / 12 | 12 | 0 / 0 / 0 | 4 / 3 / 5 | 1,570 / 3,793 |
| Greater Sudbury / FIRE | 108 → 236 | 216 | 108 / 20 / 108 | 108 | 0 / 0 / 0 | 24 / 41 / 63 | 1,713 / 6,442 |
| Greater Sudbury / EMS | 72 → 144 | 144 | 72 / 0 / 72 | 72 | 0 / 0 / 0 | 15 / 24 / 33 | 1,711 / 6,010 |
| Guelph / FIRE | 36 → 84 | 72 | 36 / 12 / 36 | 36 | 0 / 0 / 0 | 13 / 27 / 8 | 1,670 / 5,673 |
| Guelph / EMS | 18 → 24 | 24 | 12 / 0 / 12 | 12 | 0 / 0 / 0 | 4 / 7 / 1 | 1,693 / 6,280 |
| Hamilton / FIRE | 156 → 350 | 311 | 156 / 38 / 156 | 156 | 0 / 0 / 0 | 65 / 59 / 70 | 1,703 / 5,721 |
| Hamilton / EMS | 108 → 216 | 216 | 108 / 0 / 108 | 108 | 0 / 0 / 0 | 38 / 37 / 33 | 1,685 / 5,652 |
| Kingston / FIRE | 60 → 133 | 119 | 60 / 14 / 59 | 60 | 0 / 0 / 0 | 18 / 15 / 41 | 1,941 / 6,188 |
| Kingston / EMS | 24 → 48 | 48 | 24 / 0 / 24 | 24 | 0 / 0 / 0 | 4 / 5 / 15 | 1,926 / 6,308 |
| Kitchener / FIRE | 42 → 98 | 84 | 42 / 14 / 42 | 42 | 0 / 0 / 0 | 15 / 20 / 21 | 1,779 / 4,563 |
| Kitchener / EMS | 18 → 36 | 36 | 18 / 0 / 18 | 18 | 0 / 0 / 0 | 4 / 9 / 5 | 2,036 / 4,328 |
| London / FIRE | 90 → 210 | 180 | 90 / 30 / 90 | 90 | 0 / 0 / 0 | 21 / 40 / 59 | 1,737 / 6,451 |
| London / EMS | 42 → 84 | 84 | 42 / 0 / 42 | 42 | 0 / 0 / 0 | 12 / 8 / 22 | 1,769 / 5,619 |
| Milton / FIRE | 30 → 68 | 60 | 30 / 8 / 30 | 30 | 0 / 0 / 0 | 1 / 19 / 18 | 1,751 / 4,375 |
| Milton / EMS | 24 → 48 | 48 | 24 / 0 / 24 | 24 | 0 / 0 / 0 | 6 / 6 / 12 | 1,694 / 4,274 |
| Mississauga / FIRE | 138 → 322 | 271 | 138 / 46 / 138 | 138 | 0 / 0 / 0 | 38 / 74 / 72 | 1,691 / 5,449 |
| Mississauga / EMS | 78 → 156 | 156 | 78 / 0 / 78 | 78 | 0 / 0 / 0 | 19 / 25 / 34 | 1,730 / 6,431 |
| Niagara Falls / FIRE | 42 → 96 | 84 | 42 / 12 / 42 | 42 | 0 / 0 / 0 | 14 / 18 / 22 | 1,716 / 4,597 |
| Niagara Falls / EMS | 12 → 24 | 24 | 12 / 0 / 12 | 12 | 0 / 0 / 0 | 7 / 3 / 2 | 1,739 / 4,777 |
| Oakville / FIRE | 54 → 126 | 107 | 54 / 18 / 54 | 54 | 0 / 0 / 0 | 12 / 20 / 40 | 1,717 / 4,930 |
| Oakville / EMS | 24 → 48 | 48 | 24 / 0 / 24 | 24 | 0 / 0 / 0 | 9 / 8 / 7 | 1,718 / 3,245 |
| Ottawa / FIRE | 270 → 603 | 537 | 270 / 66 / 267 | 270 | 0 / 0 / 0 | 63 / 124 / 149 | 1,718 / 6,437 |
| Ottawa / EMS | 120 → 240 | 240 | 122 / 0 / 118 | 122 | 0 / 0 / 0 | 34 / 43 / 45 | 1,696 / 6,471 |
| Richmond Hill / FIRE | 36 → 84 | 72 | 36 / 12 / 36 | 36 | 0 / 0 / 0 | 6 / 23 / 19 | 1,702 / 5,056 |
| Richmond Hill / EMS | 12 → 24 | 24 | 12 / 0 / 12 | 12 | 0 / 0 / 0 | 1 / 5 / 6 | 1,619 / 2,602 |
| St. Catharines / FIRE | 36 → 84 | 71 | 36 / 12 / 36 | 36 | 0 / 0 / 0 | 10 / 23 / 15 | 1,726 / 4,512 |
| St. Catharines / EMS | 12 → 24 | 24 | 12 / 0 / 12 | 12 | 0 / 0 / 0 | 4 / 6 / 2 | 1,702 / 4,857 |
| Thunder Bay / FIRE | 48 → 110 | 96 | 48 / 14 / 48 | 48 | 0 / 0 / 0 | 23 / 20 / 19 | 1,703 / 6,480 |
| Thunder Bay / EMS | 24 → 48 | 48 | 24 / 0 / 24 | 24 | 0 / 0 / 0 | 8 / 13 / 3 | 1,514 / 6,491 |
| Vaughan / FIRE | 60 → 140 | 120 | 60 / 20 / 60 | 60 | 0 / 0 / 0 | 21 / 14 / 45 | 1,944 / 5,596 |
| Vaughan / EMS | 24 → 48 | 48 | 24 / 0 / 24 | 24 | 0 / 0 / 0 | 10 / 5 / 9 | 1,999 / 5,853 |
| Waterloo / FIRE | 24 → 56 | 48 | 24 / 8 / 24 | 24 | 0 / 0 / 0 | 4 / 14 / 14 | 1,742 / 5,036 |
| Waterloo / EMS | 6 → 12 | 12 | 6 / 0 / 6 | 6 | 0 / 0 / 0 | 0 / 4 / 2 | 1,760 / 2,598 |
| Whitby / FIRE | 30 → 70 | 60 | 30 / 10 / 30 | 30 | 0 / 0 / 0 | 9 / 13 / 18 | 1,683 / 5,591 |
| Whitby / EMS | 6 → 12 | 12 | 6 / 0 / 6 | 6 | 0 / 0 / 0 | 0 / 4 / 2 | 1,982 / 5,267 |
| Windsor / FIRE | 42 → 98 | 83 | 42 / 14 / 42 | 42 | 0 / 0 / 0 | 20 / 26 / 10 | 1,897 / 5,397 |
| Windsor / EMS | 18 → 36 | 36 | 18 / 0 / 18 | 18 | 0 / 0 / 0 | 6 / 5 / 7 | 1,991 / 4,487 |

## Expansion bases below 12 destinations

Peterborough is excluded here because its unchanged six/base pools are the reference benchmark. Context below is copied from published profile/retirement notes; this inventory does not revalidate route connectivity or modeled ownership.

| City | Base | Service | Local destinations | New first-due | Deficit total12 / newFD6 | Published context |
|---|---|---|---:|---:|---:|---|
| Toronto | Fire Station 335 (`fire-toronto-fire-335`) | FIRE | 4 | 1 | 8 / 5 | Local street topology provides fewer than three distinct route-choice challenges; response-area locality takes priority. |
| Toronto | Station 59 (`ems-toronto-ems-4173463`) | EMS | 4 | 1 | 8 / 5 | Local street topology provides fewer than three distinct route-choice challenges; response-area locality takes priority. |

## Interpretation and rerun

- Explicit flags declare 7 mission cities: Peterborough with hospital transport; Oshawa, Belleville, Scarborough, Pickering, Markham, Toronto with Fire/EMS scene-response drills that finish on-scene and no hospital transport. 26 other cities remain Geo/Route-only. These are inspected capability declarations, not a final browser or mission pass.
- Fire facility categories come only from explicit facilityType/category fields; JSON records exact categories plus declared grouping. No hazard, occupancy or incident-history claim is inferred from a name.
- Route score bins are published integer scores 0–33,34–66,67–100. Legacy meaningfulDecisions are recorded separately. These summaries do not assert fixed UI difficulty selectors or fresh route validation.
- Official run-area profile methods and source URLs remain distinct from modeled road-cost ownership. Modeled support assignments are training assumptions, not official run cards or mutual aid.
- Toronto Island connectivity is scoped to the reviewed emergency-access supplement. No mainland/ferry link or blanket private-road permission is implied; read per-base availability and topology notes in the JSON.
- Dispatch driving: Road boundaries apply; one-way and turn rules are not enforced. Access points are modeled. Route Mapping separately plans over mapped directed one-way edges; it is not the simulator physics enforcement model.
- Source points and modeled access targets are not verified vehicle entrances. Planned/disputed/nonselectable records are listed separately and excluded from target denominators.

First inventory run:

```sh
node tools/report-city-call-coverage.cjs --baseline /path/to/baseline.json
```

Subsequent runs reuse the embedded baseline and default to interim:

```sh
node tools/report-city-call-coverage.cjs
```

Use `--status final` only for the intended final inventory snapshot; it does not run or sign off tests. `--output /path/to/report-stem` changes both destinations. See [source review](city-call-source-review-2026-10-29.md) for licensing/currentness limits.

Input-read consistency: **stable during this read**. Graph loaded: **no**. Execution verified by this inventory: **no execution performed**. See [the separate final QA report](city-call-validation-2026-10-29.md) for release test results; this inventory makes no pass/fail assessment of them.
