# Richmond Hill response demo verification

Baseline c1e4b87, isolated feature/richmond-hill-dispatch-demo checkout. Release prepared as 1.6.157.

- Six fire stations and two EMS bases use existing source records; planned stations excluded.
- All offered local pools checked against the actual directed city graph: 8 calls per fire station and 6 per EMS base. Every offered response and EMS hospital leg had a route.
- Desktop and phone-sized Edge: Fire and EMS complete dispatch, arrival, next call; EMS also pickup, transport and handover. Route comparisons include both EMS legs and saved history uses richmond-hill city namespace.
- Short real keyboard/touch driving segments passed. Map followed within one screen pixel after view transitions. Long leg arrival positions were controlled fixtures, not a physical full-route drive.
- Mobile EMS also completed with optional hospital-dropoff runtime deliberately blocked, using the tested local-road hospital fallback.
- 270 targeted checks passed after packaging (182 dispatch/camera/history/release checks and 88 city/data/policy checks). The repeatable browser tool passed all four desktop/mobile Fire/EMS scenarios, including deliberately unavailable optional hospital helper. Publication evidence is retained under artifacts/release-qa.

Hospital provenance: existing richmond-hill-call-10 site point. Fallback approach is modeled using existing city road geometry, not a verified ambulance entrance. Physical-phone performance and operational route suitability are not established.

Repeat browser QA with Playwright installed: `node tools/check-richmond-dispatch.cjs`. Windows uses installed Edge; Linux uses Chromium.
