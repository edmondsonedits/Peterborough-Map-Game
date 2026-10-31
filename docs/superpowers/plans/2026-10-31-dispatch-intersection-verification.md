# Dispatch intersection collision and parity audit

Release 1.6.158; extends the Richmond Hill parity work in 1.6.157. The intended behavior is a small rounded driving allowance at road junctions so a truck can cut slightly inside a turn.

## Confirmed defects and corrections

- The rounded-junction helper was already shared by both cities. Its quarter-metre endpoint keys missed some nearby endpoints that landed in different buckets. Match endpoints from distinct road features within a bounded one-metre distance; keep the cluster anchor fixed to prevent chains growing beyond that distance.
- Preserve layer/bridge/tunnel identity when grouping junction endpoints. Vertically separate roads must not create a new ground-level turning area together.
- Require corner geometry to finish installing before announcing that road physics is ready. Previously it loaded as an optional enhancement after readiness.
- Propagate the canonical build cache token through stations, road bootstrap, collision core and corner helper. Fixed historical tokens could retain old versions after deployment.
- Index synthetic junctions with the selected city's actual grid size. Both current cities use 80 m; a 32 m fixture exposed the latent hardcoded-grid defect.
- Make nearest-road searches enforce their requested distance. The old query could return a distant segment sharing a grid cell, affecting station-exit and arrival helpers.

Road widths and rounded allowance radii are unchanged. Original road datasets and the directed route graph are unchanged.

## Comparison and verification

An endpoint audit found 53 candidate close-node pairs within the Richmond Hill map envelope and one in Peterborough. These are candidates, not 53 independently verified intersection defects. After conservative matching and grade separation, the actual Richmond Hill network records 42 near-endpoint matches; Peterborough records three endpoint matches. Node and match counts are different measures.

A real Richmond Hill source-gap witness at 43.83861523249502, -79.38975586035082 (near Leitchcroft Crescent) was outside the old driving union and is inside the repaired rounded area. Desktop and mobile-layout Edge each completed a controlled 60-step turn through that point with production collision and hard-boundary physics: zero collisions, zero hard-boundary corrections. A separate off-road negative probe remained blocked. Driver input is replaced only during this deterministic geometry probe; keyboard and touch input are checked by the workflow tool.

All three local startup cases had installed corner geometry before the service choice appeared: Peterborough desktop 1.1 s, Richmond Hill desktop 1.5 s and mobile layout 1.7 s on this computer. These are desktop measurements, not phone performance measurements.

## Peterborough-to-Richmond Hill parity checklist

| System | Current evidence |
|---|---|
| City map and road geometry | Correct selected city; 108,640 original Richmond Hill segments |
| Rounded intersection turns | Real gap witness, rotated fixtures, short gaps and off-road negative checks |
| Station/base selection | Six fire stations and two EMS bases, local spawns |
| Road lookup and station exit | Distance-bounded nearest-road regression and actual short driving segments |
| Controls/gears | Keyboard and touch drive in workflow checks; existing shared control regressions |
| Camera centering | Truck within one screen pixel after follow/next-call transitions |
| Call pools and routing | 48 Fire base-call offers and 12 EMS base-call offers connected; EMS hospital routes connected |
| Dispatch progression | Desktop/mobile Fire response, arrival, completion and Next Call |
| EMS progression | Pickup, hospital transport and handover, including optional-helper fallback |
| Route learning and history | Response/transport comparison lines and city-scoped saved history |
| Startup/version coherence | Required corners-ready gate and canonical nested cache tokens |

Long response/transport legs use controlled arrival fixtures. This audit does not establish that every intersection has been physically driven or that an actual phone has been tested.

Repeat with Playwright installed: `node tools/check-dispatch-intersections.cjs [base-url]` and `node tools/check-richmond-dispatch.cjs [base-url]`. Eleven corner/readiness/cache/lookup regressions run in Pages CI via `tests/dispatch-intersections.test.cjs`.
