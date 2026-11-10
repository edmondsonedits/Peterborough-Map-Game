# Storefront lettering fit — 2026-11-10

The actual v1.6.204 Balanced cab captures show very small, vertically compressed names on KFC, Little Caesars, Walmart, Starbucks and Pizza Pizza. The renderer reported a sign because a text plane existed; that metadata did not establish readable ink size.

Inspected actual captures under `qa-captures/f7d9610/evidence/current/balanced/`:

- `chemong-south/chemong-r057-446366842-cab.png` and owner R057.
- `chemong-south/chemong-r053-446343895-cab.png` and owner R053.
- `chemong-north/chemong-r014-176908280-cab.png` and owner R014.
- `chemong-north/chemong-r026-755556771-cab.png`.
- `chemong-north/chemong-r037-383393878-cab.png`.

## Cause

`createFootageFacade` previously drew every name with a fixed 46 px font into a fixed 768 × 96 texture, then mapped that texture onto a plane of `boardWidth * .9` by `boardHeight * .68`. Short words occupied only a small fraction of the texture width; the fixed texture aspect did not match the physical panel aspect. The already-reduced plane height lost another large fraction to unused font/canvas padding. Thus a wide Little Caesars name was flattened, and KFC became a few faint pixels inside a much larger pale plaque.

The regression test uses controlled complete Canvas text metrics and the actual renderer's generated plane. Before this change, a 0.4 m KFC sign produced only **0.0978 m** of glyph height. This is an independent layout fixture, not a measurement of real-world KFC lettering or a new browser screenshot.

## Bounded correction

`facade-sign-text.js` now measures actual ink bounds using Canvas `measureText` (`actualBoundingBoxLeft/Right/Ascent/Descent`). It creates a tightly fitted texture and scales the texture plane uniformly within the existing physical sign rectangle. Letter aspect is preserved rather than stretched to a fixed 8:1 texture. The actual glyph bounds are centered, including italic overhang. There is no `fillText` horizontal compression.

Backing-board dimensions, sign locations, source identity, business text, colors and building massing are unchanged. Text may use up to 90% of the existing board height/width; small padding remains around the measured ink. The raster is bounded to 1024 × 256 pixels. If complete Canvas metrics are absent, a conservative bounded estimate is used and labeled `metrics:'estimated'`, rather than being reported as measured.

The actual rendered-sign metadata now includes `textFit`: measured/estimated status, texture dimensions, physical panel and text-plane dimensions, and resulting ink dimensions. This provides useful evidence for later cab review without claiming that a text plane alone is readable.

Applied lettering may now use a 0.01–0.6 m outset, honoring the reviewed Ultramar value of 0.025 m. Boarded signs retain the existing minimum 0.3 m clearance. No backing board is added to applied lettering.

## Limits and verification

No business was enlarged beyond its current sign bounds and no tenant was invented. KFC and Little Caesars still use the existing inferred 2.6 m source wall, which limits their fascia height and remains visibly different from the photographed massing. This lettering correction does not claim to solve that separate geometry issue or the broad plaza's missing tenant records.

The new fitting test first failed against the previous renderer, then passed after the shared fix. Coverage checks actual generated plane dimensions against independently supplied glyph metrics for KFC, Little Caesars, Walmart and Pizza Pizza; long/italic text bounds; bounded incomplete-metric fallback; and applied/boarded outset behavior. The existing source-height test now identifies the backing board through its explicit panel-width metadata because a tightly fitted text plane intentionally need not span the full board width.

Actual normal/Lite cab recaptures and independent visual approval are still required. Improved mathematical fit is not a claim that the final photographed storefront appearance has passed review.
