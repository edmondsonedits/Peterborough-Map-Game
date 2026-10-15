# Route network build report

Snapshot: 2026-10-14T20:21:12Z; graph: `ontario-osm-2026-10-14-v2`.

| City | Ways | Unique nodes | Node references | JS bytes | Controls | Restrictions |
|---|---:|---:|---:|---:|---:|---:|
| peterborough | 6817 | 25144 | 34036 | 743985 | 2530 | 185 |
| oshawa | 22320 | 69003 | 99292 | 2227789 | 16571 | 387 |
| belleville | 6181 | 18881 | 26711 | 602793 | 1467 | 115 |
| scarborough | 72548 | 227233 | 327296 | 7913049 | 73010 | 2866 |
| ajax | 24831 | 78220 | 112030 | 2511385 | 20407 | 425 |
| barrie | 9891 | 31962 | 45453 | 1017829 | 4613 | 207 |
| brampton | 72379 | 225215 | 323314 | 7136409 | 54571 | 1815 |
| brantford | 5755 | 17698 | 25778 | 567649 | 2803 | 120 |
| burlington | 43698 | 142316 | 203312 | 4442289 | 31249 | 1242 |
| cambridge | 24320 | 87990 | 121682 | 2696913 | 20251 | 477 |
| chatham-kent | 16909 | 49621 | 72020 | 1537105 | 6665 | 283 |
| clarington | 19890 | 60554 | 87119 | 1981537 | 12374 | 343 |
| greater-sudbury | 11785 | 91574 | 106831 | 1981777 | 4520 | 350 |
| guelph | 14141 | 48073 | 67219 | 1501765 | 9099 | 221 |
| hamilton | 66519 | 215483 | 307320 | 6747493 | 44441 | 1577 |
| kingston | 8969 | 43900 | 55738 | 1139129 | 5820 | 200 |
| kitchener | 27661 | 103503 | 142151 | 3103581 | 23564 | 557 |
| london | 22381 | 77677 | 108913 | 2151665 | 14054 | 543 |
| markham | 65046 | 207814 | 297424 | 6665029 | 54164 | 1469 |
| milton | 56366 | 186126 | 263829 | 5747037 | 40874 | 1392 |
| mississauga | 125831 | 391720 | 564441 | 13182677 | 109458 | 4613 |
| niagara-falls | 27794 | 63198 | 99338 | 2179061 | 6677 | 675 |
| oakville | 42956 | 138577 | 198571 | 4403877 | 34447 | 1303 |
| ottawa | 57475 | 183963 | 259279 | 6143745 | 37731 | 2553 |
| pickering | 51388 | 163538 | 234232 | 5256301 | 44880 | 982 |
| richmond-hill | 44684 | 144096 | 205796 | 4599501 | 37380 | 976 |
| st-catharines | 20853 | 49885 | 77008 | 1645257 | 4748 | 462 |
| thunder-bay | 6243 | 17413 | 25888 | 566961 | 1797 | 173 |
| toronto | 157630 | 487209 | 703471 | 16406825 | 140255 | 5108 |
| vaughan | 79026 | 247673 | 355782 | 8093769 | 66547 | 2521 |
| waterloo | 20031 | 76442 | 104327 | 2288821 | 17319 | 445 |
| whitby | 25854 | 80537 | 115680 | 2591381 | 20020 | 441 |
| windsor | 13846 | 49801 | 70046 | 1472377 | 17087 | 213 |

Total generated browser asset size: **131,246,761 bytes** across 33 packs. City buffers overlap, so summing city node counts would count shared regional OSM nodes more than once.

Toronto includes exactly 49 scoped, verified island asphalt service-way policy annotations. No bridge, boardwalk or ferry receives an access override.

Validation: `python -m unittest discover -s tests -p test_ontario_route_builder.py -v` — **17 tests passed**, including all 33 generated packs, in 22.3 seconds. The Peterborough loader was also executed with native `DecompressionStream`, `Blob` and `Response`, validating its promise/global/event contract.
