# Water/Hunter seven-frontage review — 2026-11-10

The implementation corrects seven existing source profiles using the supplied owner photographs and the independent `water-hunter-reference` ledger. Exact adjacent current OSM edges determine every face. Existing wall heights, footprints, roof geometry and collision remain unchanged. None of the seven IDs belongs to an authored GLB in the active emergency-facility/reconstruction catalog, so no duplicate facade is forced over an authored replacement.

This is an implementation and automated-check record, **not visual approval**. Actual cab-seat views, raised fly views and oblique comparisons from the integrated CI candidate remain necessary. Numeric widths, heights, colors, fractions, bay depth and enclosure proportions are visual estimates, not measurements.

## Observed cues and implementation

| Source ID | Owner photos | Corrected visible cue | Bounded approximation / omission |
|---|---|---|---|
| `way/1006243552` | R228 | Six upper sash; full-height lime shop surround, separate blue fascia, dark south shop and red/white north shop | Three lower glass fields and one lime entry; recess and trim simplified; uncertain shop name omitted |
| `way/1006243558` | R231/R233 | Southern cream three-storey facade, two flat sash columns on left/south, enclosed stacked bay right/north, red central entry | Closed three-face bays with connecting projected spandrel; ground transom arch and small decorative trim omitted |
| `way/1006243559` | R231/R233 | Northern facade is also cream; same flat-sash/bay handedness, dark storefront | Corrects prior brick assignment; enclosed bays retained; narrow boundary passage is not converted to an invented entrance |
| `way/1006243553` | R232 | Six top arches and six rectangular middle sash beneath bracketed cornice | Three lower shop fields without guessed repeated doors; EAST CITY KNIFE CO is visible on glass, so no opaque named plaque is invented |
| `way/1006243555` | R235/R236/R238/R242 | Scotiabank Water return has six broad upper glass groups plus narrow terminal field; red tower south/right, white applied name north/left | Ground groups estimated; tower stays below existing wall ceiling; Hunter glazing retained and former Hunter signboard removed; no guessed raised tower mass |
| `way/1006243541` | R248 | Smiles to You has one broad window, west/right door and blank eastern brick area below one dark fascia | Pale text uses actual dark fascia; turquoise final word and temporary poster omitted |
| `way/1031042883` | R219/R221/R222/R225/R228 | Nordia/364 Water has three thin upper ribbons, broad first-upper glazing and dark ground lobby; blue curtain wraps two short southwest faces | Full four-face correction uses exact adjacent edges; no north-end blue bay. Three continuous curtain fields and dark lobby panel approximate the short faces. Projecting cap, angled lobby, ramp, doors and temporary sale sign are omitted |

The independent reference review initially counted only five broad Scotiabank upper groups in the implementation. Rechecking R235 and R236 confirmed six broad groups plus the narrow terminal field beside the tower; the implementation and regression were corrected before release. R232 was also rechecked: the glass lettering reads EAST CITY KNIFE CO, not COFFEE CO.

Both cream records explicitly clear `balconyLevels` and automatic upper columns. The opt-in `enclosedBays` helper uses two 2.25 m-wide tiers, a .55 m estimated projection and .58 front-width fraction. Its lower `joinToNext` fills the matching projected inter-floor spandrel. Each tier has enclosed front/angled side glazing and solid caps; there are no open rails or posts. Flat sash remain separate from the projected bay.

Scotiabank uses `signStyle: 'applied'`: the canvas and text plane have no opaque background or backing board. Nordia uses primary west main, west short, south short and south main faces in that order. Its main-face blue `verticalGlazing` is cleared, first-upper band grows from .7 m to 2.4 m, and the old incorrectly placed t=.73 pier is replaced by an estimated south/west-end pier. Blue corner fields never use a nonadjacent chord to combine the source edges.

## Source height and compatibility

These are existing reviewed profiles, so the runtime selects their source `eaveHeight`; bare OSM inference is not the active dimension path. Tests call the actual `app.js` dimension function with the active profiles, render with real Three.js and use the resulting wall/roof limits. Flat-roof allowance is still supplied to the facade call, but details remain bounded by the existing wall height.

| Source ID | Existing active wall height (m) |
|---|---:|
| `way/1006243552` | 7.1 |
| `way/1006243558` | 9.4 |
| `way/1006243559` | 9.7 |
| `way/1006243553` | 10.0 |
| `way/1006243555` | 7.6 |
| `way/1006243541` | 3.9 |
| `way/1031042883` | 20.0 |

All authored panels retain their requested height rather than collapsing against a fictional wall ceiling. Glass fields stay within their own face and do not overlap another opening; lettering occupies a separate band. The tests exercise regular and Lite detail paths, source-profile immutability, current ring adjacency, outward directions, GLB ownership and the shared reference opt-out. The unresolved Simcoe identities `way/1006243563` and `way/458496269` remain absent from this overlay.

The focused Water test has nine passing checks. The combined Water, enclosed-bay, sign renderer/layout, recorded arches/facades, recording integration, route geometry/source heights, Sherbrooke, Reid and Chemong compatibility run has **85 passing checks, zero failures**. This verifies data and geometry behavior; it does not establish visual likeness or driving visibility.

## CI capture cameras

All coordinates lie on the current mapped road centerlines. Use actual cab-seat mode for driver review. A fly request at 2.5 m is clamped to 5 m and is not cab-height evidence. Capture raised fly and oblique views separately. Runtime road occupancy, collision and occlusion still require the integrated capture run.

| Record / face | Latitude | Longitude | Bearing | Road source |
|---|---:|---:|---:|---|
| Lime shop | 44.3051161 | -78.3188765 | 87.7° | `way/454960676` |
| Southern cream | 44.3052097 | -78.3188818 | 267.7° | `way/454960676` |
| Northern cream | 44.3052866 | -78.3188861 | 267.7° | `way/454960676` |
| Six-arch brick | 44.3052323 | -78.3188831 | 87.7° | `way/454960676` |
| Scotiabank Water | 44.3057337 | -78.3189114 | 87.7° | `way/454960676` |
| Smiles to You | 44.3060233 | -78.3172751 | 175.8° | `way/499202158` |
| Nordia west main | 44.3049672 | -78.3188680 | 87.7° | `way/454960676` |
| Nordia west short | 44.3048422 | -78.3188610 | 87.7° | `way/454960676` |
| Nordia south short | 44.3047338 | -78.3186786 | 355.2° | `way/33951205` |
| Nordia south main | 44.3047452 | -78.3184884 | 355.2° | `way/33951205` |

The two main Nordia edges and both short corner edges are separately declared in the module; the renderer's four-face support preserves these orientations and frontage indices. The coordinates above were also sent directly to the CI capture owner.


An independent final source review confirmed the six shop/frontage records and Nordia's corrected southwest directions, main-wall tiers and corner curtain placement. No blocking source-fit issue remained; measured geometry and visual game approval are still outside that source review.

## Owner source provenance

Paths and source SHA-256 values below identify supplied archive originals from `photo-index.csv`; the inspected extracted reference copies are tracked separately in that index. No external imagery is introduced.

| Photo | Source path | Source SHA-256 |
|---|---|---|
| R219 | `dense/flat-768/frame_0354_lens0_pitch+0.jpg` | `ff62a2a5274fcae2dc846e69416126dea02c259fe9d84e2d6d43939ee4a83c19` |
| R221 | `sherbrooke-water-hunter/perspective-2048/0714s_lens0_pitch+0.jpg` | `57371f5366f978d3fb1236436af8191e56fc3eaa893ab94cbd826ee259ce3afe` |
| R222 | `flat-priority-2048/0720s_lens0_pitch+0_up15.jpg` | `2c5965ca4a151e0c6b2894d4b5ebc0e811669042c779baa8999f7ed8604dfe06` |
| R225 | `dense/flat-768/frame_0360_lens0_pitch+0.jpg` | `4be8b56332e701bd39a3c6a7bcf9bf0b7dbf59c318dbee4a6b814ec46f77611f` |
| R228 | `sherbrooke-water-hunter/perspective-2048/0732s_lens0_pitch+0.jpg` | `521bd8dd8c4104630ed90dea6a4b9a4af110a4ba95f82c072756904548c6474e` |
| R231 | `dense/flat-768/frame_0367_lens1_pitch+0.jpg` | `673abe6ba11849272cd93afb13af21f71173f8a3cb1a7cd020576a5881b811e6` |
| R232 | `flat-priority-2048/0735s_lens0_pitch+0_up15.jpg` | `1aaeecfa69e827553b9f1a78d6d2210c5fa80e5c568c7876ddbe5341126e5702` |
| R233 | `flat-priority-2048/0735s_lens1_pitch+0_up15.jpg` | `3dc26a3e09947ed2b5e1ed0807aff48fbeef47ae5a2d6c399300ee10da8f6a0b` |
| R235 | `dense/flat-768/frame_0370_lens0_pitch+0.jpg` | `4f6025b061ea83ee0a829cb67cdc10b96e9c111380c3dcbcaf22e477368c385a` |
| R236 | `dense/flat-768/frame_0372_lens0_pitch+0.jpg` | `a23e4c5cc654f88142fdf048f5dd1f1d0e0fee9b8bef00bcd23ce75166a828c9` |
| R238 | `flat-priority-2048/0750s_lens0_pitch+0_up15.jpg` | `dc7f48be763d9509712553c8d23376d688f63664cce670a227f63ea373bef55e` |
| R242 | `dense/flat-768/frame_0378_lens0_pitch+0.jpg` | `5108fc676cd51941085d9d93c196c192d91f6bbc5315d0942fa0e7a0ae8805e4` |
| R248 | `dense/flat-768/frame_0385_lens0_pitch+0.jpg` | `de53e892826f84fc1d79509939a439cc19cf4787754d98b678b869eba5b6151f` |
