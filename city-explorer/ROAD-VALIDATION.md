# Peterborough Road Alignment Validation

Generated: 2026-07-15T18:36:21+00:00

**Result: PASS**

The explorer renders cached OpenStreetMap street geometry. Public drivable streets were independently compared with Ontario's authoritative Ontario Road Network (ORN) Road Net Element layer.

## Completeness safeguard

ORN is downloaded through a spatial object-ID query followed by chunked object-ID requests. This avoids ArcGIS transfer limits silently omitting part of Peterborough's network.

## Coverage

- Public OSM roads checked: **2,765**
- All rendered OSM drivable features: **5,945**
- Complete ORN roads: **3,179**
- ORN layer: `ORN Road Net Element`

## Centreline results

| Comparison | Median | P90 | P95 | Within 10 m | Within 20 m |
|---|---:|---:|---:|---:|---:|
| Public OSM → ORN | 0.64 m | 2.34 m | 3.63 m | 98.43% | 98.72% |
| ORN → public OSM | 0.63 m | 2.32 m | 3.57 m | 97.60% | 98.01% |
| All rendered OSM → ORN | 1.23 m | 80.14 m | 134.32 m | 68.62% | 72.72% |

## Street names

- Comparable named segments: **2,628**
- Normalized official-name agreement: **95.32%**

## Streets requiring manual review

| Street | P90 offset | Within 20 m | Samples |
|---|---:|---:|---:|
| HWY 7 | 1712.46 m | 72.24% | 544 |
| O TOOLE CRES | 254.18 m | 40.00% | 50 |
| WRIGHT AVE | 242.56 m | 0.00% | 19 |
| BOLSTER BLVD | 228.38 m | 10.53% | 19 |
| DOLMAN ST | 187.68 m | 65.22% | 46 |
| FIRE ROUTE 4A | 180.16 m | 48.28% | 58 |
| NORTHCOTT AVE | 179.65 m | 63.86% | 83 |
| LIGHTFOOT TER | 167.97 m | 0.00% | 10 |
| BRISCO GDNS | 82.13 m | 0.00% | 10 |
| MUSEUM DR | 77.36 m | 71.11% | 45 |
| RAMSAY RD | 65.81 m | 75.00% | 24 |
| DENNE LN | 44.06 m | 44.44% | 9 |
| ALEXANDER AVE | 35.43 m | 84.62% | 26 |
| GZOWSKI WAY | 33.80 m | 77.05% | 61 |

## Interpretation

Pass criteria cover public drivable streets. Service roads, parking aisles, driveways, tracks and explicitly private roads remain rendered but are reported separately because ORN is not a complete reference for them.

Complete ORN object-ID pagination; NAD83 / UTM zone 17N; centreline samples about every 15 metres; nearest-line distance measured in both directions.

- Divided roads can be one centreline in one source and separate carriageways in the other.
- Recent construction and private roads can be present in only one source.
- The test validates centrelines and names, not curbs, lanes, grades, turn rules or legal survey boundaries.
