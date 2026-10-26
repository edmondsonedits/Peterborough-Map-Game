# Storefront photo search — 25 October 2026

Two agents searched in parallel: Wikimedia/open-license sources and business/local-directory sources. Downloaded photographs stay in ignored local `test-artifacts/web-frontages-20261025/`; the game loads no online source photos. Public accessibility does not establish redistribution permission.

| Building | Reference | Use / status |
|---|---|---|
| Pappas Building, 407–409 George St N | [Mykola Swarnyk, 7 July 2012](https://commons.wikimedia.org/wiki/File:Pappas_Building_Peterborough.JPG) | Actual downloaded photo inspected. CC BY-SA 3.0; credit author/source/license and mark modifications; adapted assets under the same/compatible licence. First batch: cream brick, plum trim, three storeys and six-column upper window rows on `way/1005977973`. Photo is old; no current tenant/paint claim. |
| Cork & Bean, 382 George St N | [Th3rdwave photo](https://www.th3rdwave.coffee/cork-bean-peterborough/), [address](https://order.toasttab.com/online/cork-and-bean-peterborough-) | Actual downloaded photo inspected. Photographer/date/reuse rights unknown; reference only. First batch: buff brick, rust fascia and pale-framed glazing on `way/1006243570`. Cropped image does not establish full height/roof. |
| Morrow Building, 442–448 George St N | [Ron Crough photo](https://commons.wikimedia.org/wiki/File:Morrow_Building,_442-448_George_Street_North_on_the_corner_of_George_and_Brock_St..jpg) | Actual downloaded photo inspected. CC BY-SA 3.0. Mansard, dormers, tan/olive masonry, ornate surrounds and corner elevations. Stated 2015 photo date conflicts with 2014 upload history. Needs exact multi-footprint/corner mapping before implementation. |
| KitCoffee, 144 Hunter St W | [Th3rdwave photo](https://www.th3rdwave.coffee/kitcoffee/) | Actual downloaded photo inspected. Dark storefront, yellow awning, pale upper wall/teal trim. Rights/date unknown, reference only. Current approved map entry points to a George-facing frontage; do not promote without rematching the photographed Hunter frontage. |
| Riley’s Pub, 251 George St N | [Official address](https://www.rileysptbo.com/contact), [photo](https://dynamic-media-cdn.tripadvisor.com/media/photo-o/24/23/72/b1/caption.jpg?h=1400&s=1&w=1400) | Search preview inspected by agent. Rights/date unknown; reference only. Dark frontage/gold sign. Current footprint also has an inferred rear-profile record: needs reconciliation before replacement. |
| Black Honey, 221 / 217 Hunter St W | [Tourism reference](https://thekawarthas.ca/black-honey-local-food/) | Storefront/patio reference, older imagery, no reuse licence found. Not implemented; needs a cleaner full-front view. |
| Market Hall, 140 Charlotte St | [Architect’s project page](https://www.unitydesignstudio.ca/market-hall) | Exterior preview inspected by agent; brick, tower and cornices. No reuse licence found. Not implemented; complex landmark needs dedicated mapping/geometry review. |

## First-batch limits

These are rough procedural appearance models, not photogrammetry. Pappas height and opening spacing are visual estimates. Its ornate arched window surrounds are simplified by the existing renderer. Cork & Bean’s unseen floors and roof retain existing massing. Original mapped footprint coordinates and existing owner-photo assets are preserved. No physical-phone verification or public deployment is claimed.

Source details and implementation decisions are in `city-explorer/web-building-evidence.json`. Local comparison: `http://127.0.0.1:8893/test-artifacts/web-frontages-20261025/preview.html` while the local server runs.
