# Station 1 source and uncertainty ledger

## Controlling images inspected

| Evidence | What is actually visible | Use in this model |
| --- | --- | --- |
| Owner footage frame `0158_LEFT_SIDE.jpg`, sequence 158, 127.760967 seconds into the stitched reference export | Five red sectional overhead doors, four small windows per door, brown frame/canopy, yellow bollards, buff masonry, projecting glazed watchroom, raised rear roof | Primary present-day frontage and colour relationships; sampled lighting is not baked into albedo |
| Owner footage frames `0149_LEFT_SIDE.jpg` and `0170_LEFT_SIDE.jpg` | West and east wing elevations, sloped clerestory, window bands, detached rear training tower and adjacent buildings | Main silhouette, footprint correspondence, tower shape and separation from neighbours |
| [City apparatus-bay photograph](https://www.peterborough.ca/media/vskpdzld/peterborough-fire-services_2018_08_28_city_peterborough_2018_25.jpg), linked from [Fire Services](https://www.peterborough.ca/living-in-peterborough/fire-services/) | Fire Hall No. 1 lettering, mint lower block wall, teal belt, cream upper wall, white roof structure, exposed services, sectional-door track and yellow exhaust hose | Bay colour and architectural-detail reference; exact dimensions remain estimated |
| [PtboCanada tour, 16 March 2011](https://www.ptbocanada.com/journal/2011/3/16/ptbocanada-takes-you-on-a-tour-of-peterborough-fire-services.html) | Exterior, dispatch booth, workstations, gym, gear racks, heritage equipment and vehicles | Corroborates station identity and functions; historical contents do not establish current room adjacency |

The owner reference copies are in `H:/ChatGPT/Peterborough-Station1-20261027/research/images`. The controlling 0158 image SHA-256 is `ce4ce7085b801ee1e44690276c31b982c768dceff6fa4de000b02d940b896759`. Downloaded City and tour images are research-only. The model uses newly authored geometry and procedural materials, with no photo pixels embedded in shipped textures.

## Documents retrieved

- The [City Fire Services directory](https://www.peterborough.ca/living-in-peterborough/fire-services/who-we-are/) identifies Station 1 at **210 Sherbrooke Street**. This is not the Northcrest Road Station 2 building or an older Aylmer Street hall.
- The [2023 capital budget](https://www.peterborough.ca/media/mkuck2sw/2023-capital-book-draft-1.pdf), printed page 30 / PDF page 34, project 3-1.04, describes LED lighting, shower/decontamination work, building automation, and overhead-door/operator replacement. These are budget descriptions, not proof every item was completed.
- The [2024–2028 Corporate Energy Management Plan](https://www.peterborough.ca/media/zd2od5p3/city-of-peterborough-corporate-energy-management-plan-update-2024-2028.pdf), Table 9 / PDF page 23, lists the Sherbrooke Fire Hall at **1,744 m² gross floor area**. That figure is not used as a footprint or room plan. Proposed HVAC/boiler dates likewise do not establish completed work.
- [City rooftop-unit tender](https://cityofpeterborough.bidsandtenders.ca/Module/Tenders/en/Tender/Detail/7d4ec848-921c-4643-a922-a5e379dad880) confirms a Station 1 HVAC project. No dimensioned architectural drawings were retrieved from this tender.
- A [generator and fuel-tank project listing](https://projects.constructconnect.com/details/6027595-fire-station-1-new-gas-diesel-tank-and-generator-installation&find_loc=ON-K9J-2N3) advertises plan/specification files. Those files were not retrieved and are not used as evidence of layout.

Copies of the two City PDFs and the document-search report are preserved in the external project research folder. Search results, advertised drawing counts and proposed works are not treated as inspected blueprints or as-built records.

## Geometry and fidelity boundaries

The main footprint and 23.918 m facade line follow packaged OSM source `way/1009651229`; the detached tower footprint follows packaged City building `city-building/6/3300`. The old survey's four-bay annotation is contradicted by the owner's clear five-door image and is not used. Adjacent Royal LePage and LCBO buildings remain separate, as do other City building records behind the hall.

The frontage proportions, projecting watchroom and roof shape are constrained by images and the footprint. Door opening dimensions, heights, wall thicknesses, roof construction, exact colours and tower elevations are photo-derived modelling estimates. The detailed apparatus bay is a gameplay interior; rear office, dispatch, gym and service-room adjacencies are not fabricated into a purported accurate floor plan. The side wing is retained as exterior massing. No public dimensioned complete floor plan was located in the retrieved sources.

The model supports the simulator's existing truck envelope and closed-door start. The second bay from the right viewed from the street is the gameplay spawn, as subsequently requested by the user; this is a user-facing gameplay choice, not a claim about current operational parking assignments.
