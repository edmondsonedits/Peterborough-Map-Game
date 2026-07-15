# Peterborough Road Alignment Validation

Generated: 2026-07-15T17:58:04+00:00

**Result: REVIEW**

The browser road geometry is built from the cached OpenStreetMap extract. This report compares those drivable road centrelines with Ontario's authoritative Ontario Road Network (ORN) Road Net Element layer.

## Source data

- OSM drivable road features: **5,945**
- ORN road features in the same bounding box: **1,943**
- ORN item: `Ontario Road Network (ORN) Road Net Element`
- ORN owner: `OntarioProvincialMapping`
- ORN layer: `ORN Road Net Element`

## Positional comparison

| Direction | Median | 90th percentile | 95th percentile | Within 10 m | Within 20 m |
|---|---:|---:|---:|---:|---:|
| OSM → ORN | 25.61 m | 229.10 m | 402.44 m | 43.33% | 48.01% |
| ORN → OSM | 0.58 m | 2.07 m | 2.88 m | 99.66% | 99.91% |

The two-direction check catches both displaced OSM streets and authoritative ORN streets that may be absent from the game extract.

## Street-name comparison

- Segments with usable names in both sources: **1,571**
- Normalized name agreement: **0.0%**

## Streets flagged for manual review

| Street | P90 offset | Within 10 m | Samples |
|---|---:|---:|---:|
| HWY 7 | 2398.42 m | 41.30% | 494 |
| SHERBROOKE ST WEST | 1666.03 m | 1.12% | 178 |
| PARKHILL RD WEST | 1467.54 m | 39.22% | 640 |
| JOPLING LN | 1467.44 m | 0.00% | 43 |
| LILY LAKE RD | 1452.38 m | 28.41% | 352 |
| DOURO SEVENTH LINE | 1441.95 m | 0.86% | 116 |
| BENSFORT RD | 1299.13 m | 30.81% | 396 |
| LINDSAY RD | 1157.81 m | 27.04% | 307 |
| CREAMERY RD | 1103.54 m | 0.00% | 28 |
| UNIVERSITY RD | 1054.94 m | 1.24% | 161 |
| DRUMMOND LINE | 1018.44 m | 1.91% | 262 |
| HILLIS RD | 937.89 m | 1.41% | 71 |
| SIXTH LINE | 773.97 m | 72.94% | 303 |
| MCNAMARA RD | 739.20 m | 0.86% | 116 |
| BURNHAM LINE | 722.05 m | 56.71% | 395 |
| FIFE S BAY RD | 709.14 m | 74.93% | 371 |
| DILLON RD | 708.15 m | 51.35% | 185 |
| ACKISON RD | 701.70 m | 1.00% | 100 |
| KEENE RD | 648.69 m | 68.97% | 464 |
| BROWN LINE | 648.25 m | 55.00% | 280 |
| THIRD LINE | 646.16 m | 1.32% | 76 |
| CHEMONG RD | 627.38 m | 48.59% | 743 |
| MAHOOD RD | 570.38 m | 2.15% | 93 |
| COUNTY RD 4 | 560.08 m | 7.05% | 454 |
| LANSDOWNE ST WEST | 550.62 m | 33.58% | 801 |
| JOHNSTON DR | 550.38 m | 14.16% | 233 |
| MEADOWVALE RD | 545.94 m | 2.38% | 42 |
| REDMOND RD | 531.20 m | 51.63% | 184 |
| COUNTY RD 19 | 476.57 m | 1.27% | 79 |
| LAKEFIELD RD | 439.27 m | 44.68% | 235 |

## Method and limits

Road centrelines were projected to NAD83 / UTM zone 17N and sampled every ~15 m. Each sample was measured to the nearest line in the comparison network in both directions.

- Divided roads may use one centreline in one source and separate carriageways in the other.
- New construction can appear in one source before the other is updated.
- This validates centreline geometry, not curb edges, lane markings, grades, turn restrictions, or legal survey boundaries.

A passing report means the road centrelines meet the project's automated alignment thresholds. It does not mean every curb, lane, bridge deck, driveway, or recent construction project has been field-surveyed.
