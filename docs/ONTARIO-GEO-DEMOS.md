# Ontario Geo Guesser demos

The homepage offers 30 Ontario municipal demos using the same Geo Guesser engine as Peterborough. Each demo has one shared 20-address pool: 10 Easy, 5 Medium and 5 Hard. Fire/EMS chooses a starting base, not a separate call catalog. Difficulty measures local familiarity, never distance. Cross streets remain separate from the civic address and can be hidden in Settings.

Peterborough retains its full 200-address catalog (100/50/50) and existing game modes. Belleville and Scarborough retain their existing free-driving previews. Toronto covers Scarborough in the municipal research dataset; the legacy Scarborough driving entry remains available.

## Data and readiness

`cities/city-registry.js` declares independent `modes` capabilities. New city address data does not imply road-driving, routing or 3D assets are ready. Non-Peterborough mode cards carry a subdued DEMO label. Supported links preserve the city in their URL; unavailable modes have no navigation destination and open Request a demo.

`geo-guesser/city-loader.js` loads only the selected city's `geo-data.json`, then the existing shared base and dispatch stores. Peterborough keeps its original city package and compressed catalog. All new demos use the same renderer/session/provider. A failed or unsupported city shows an error and retry; it never quietly starts Peterborough.

The compact static packs retain all 686 researched facility records and 168 construction project records. Only the 582 active, eligible records with valid coordinates enter the starting-base lists. Future and unconfirmed facilities appear in a collapsed informational list, with construction stage/forecast where known; they cannot start a game. Existing active facilities remain selectable during future replacement planning.

Source inventory and review scope: the October 15, 2026 Ontario research package; Statistics Canada 2025 municipal population estimates; municipal/operator facility inventories and construction announcements; municipal boundary and connected-road cross-street checks. Call points represent researched civic/venue locations with individual target radii, not surveyed emergency entrances. Research notes and links are retained in the compact data and original research package.

## Add or refresh a city

1. Prepare the same reviewed city-pack schema used by the Ontario research package. Check municipal boundaries, verified addresses/coordinates, two cross-street references, facility status and recognition tiers.
2. Run `node scripts/build-ontario-geo-data.cjs /path/to/reviewed/package/cities`. The current builder validates and rebuilds the fixed 30-city demo release. Updating the release scope also requires changing the explicit registry and tests.
3. Keep canonical IDs stable and retain construction metadata. Only use legacy base-ID aliases for verified same facilities; leave the original saved browser delta intact.
4. Enable the corresponding registry mode only after its data and runtime pass tests. Reuse the city address pool when enabling another mode; do not fork a service-specific address list. A city without road assets must not gain a driving capability flag.
5. Run `node --test tests/*.test.cjs tests/*.test.mjs`. The Pages workflow also runs the new data, runtime, flow and request tests.
6. Run `node tools/check-ontario-demos.cjs` for real browser startup, both services, all tiers, five viewport sizes, request confirmation and local Stats. Optional `PTBO_CHROMIUM_PATH` selects an installed Chromium. `PTBO_QA_OFFLINE_TILES=1` supplies clearly marked test tiles for layout checks when external tile access is unavailable; this does not test the live map service. Production continues to use the existing map-provider policy and attribution.

## Demo request statistics

Opening or cancelling the dialog never counts. The request CTA records the selected city/mode, prevents repeat submission in the same session, and confirms the actual save result. Device counts contain only city/mode totals and are labelled **on this device** in Website Stats. They do not represent all visitors and are not administrator authentication.

Public-demo analytics can also submit a stable, retry-safe `demo_request` event through the existing analytics transport when permitted. Owner/stats exclusions and deployment opt-out rules remain in place for remote telemetry. Remote failures cannot become false shared-success messages. No new database permissions are enabled.

Shared administrator totals require the existing authenticated `PTBO_SECURE_ANALYTICS.loadStats()` integration to return the documented `demoRequests` aggregate. The repository has no deployed secure backend adapter, and Cloudflare setup is not yet confirmed. The protected global dashboard therefore remains locked until that integration is configured; device request counts work independently. See `docs/ANALYTICS-PRIVACY-SECURITY.md` for the response contract.
