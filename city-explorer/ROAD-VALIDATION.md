# Peterborough Road Alignment Validation

Generated: 2026-08-12T16:14:47+00:00

**Result: PASS**

The browser road geometry is built from the cached OpenStreetMap extract. This report compares public OSM road centrelines with Ontario's authoritative Ontario Road Network (ORN) Road Net Element layer.

## Source data

- Public OSM road features used for validation: **2,701**
- ORN road features in the same bounding box: **3,179**
- ORN item: `Ontario Road Network (ORN) Road Net Element`
- ORN owner: `OntarioProvincialMapping`
- ORN layer: `ORN Road Net Element`

## Positional comparison

| Direction | Median | 90th percentile | 95th percentile | Within 10 m | Within 20 m |
|---|---:|---:|---:|---:|---:|
| OSM → ORN | 0.65 m | 2.29 m | 3.46 m | 98.75% | 99.01% |
| ORN → OSM | 0.66 m | 2.55 m | 4.63 m | 96.55% | 97.38% |

The two-direction check catches both displaced OSM streets and authoritative ORN streets that may be absent from the game extract.

## Street-name comparison

- Segments with usable names in both sources: **0**
- Normalized name agreement: **not available from this ORN layer**

## Streets flagged for manual review

| Street | P90 offset | Within 10 m | Samples |
|---|---:|---:|---:|
| PELL DR | 264.57 m | 0.00% | 7 |
| O TOOLE CRES | 254.18 m | 40.00% | 50 |
| WRIGHT AVE | 242.56 m | 0.00% | 19 |
| BOLSTER BLVD | 228.38 m | 5.26% | 19 |
| DOLMAN ST | 187.68 m | 63.04% | 46 |
| FIRE ROUTE 4A | 180.16 m | 44.83% | 58 |
| NORTHCOTT AVE | 179.65 m | 61.45% | 83 |
| LIGHTFOOT TERRACE | 167.97 m | 0.00% | 10 |
| BRISCO GARDENS | 82.13 m | 0.00% | 10 |
| MUSEUM DR | 77.36 m | 66.67% | 45 |
| CHURCHILL DR | 70.98 m | 14.29% | 7 |
| RAMSAY RD | 65.81 m | 70.83% | 24 |
| ALEXANDER AVE | 35.43 m | 80.77% | 26 |
| GZOWSKI WAY | 33.80 m | 52.46% | 61 |
| WOODVIEW DR | 19.42 m | 46.15% | 13 |
| CARRIAGE LN | 18.13 m | 85.51% | 69 |

## Method and limits

Road centrelines were projected to NAD83 / UTM zone 17N and sampled every ~15 m. Each sample was measured to the nearest line in the comparison network in both directions.

- Divided roads may use one centreline in one source and separate carriageways in the other.
- New construction can appear in one source before the other is updated.
- This validates centreline geometry, not curb edges, lane markings, grades, turn restrictions, or legal survey boundaries.

A passing report means the road centrelines meet the project's automated alignment thresholds. It does not mean every curb, lane, bridge deck, driveway, or recent construction project has been field-surveyed.
