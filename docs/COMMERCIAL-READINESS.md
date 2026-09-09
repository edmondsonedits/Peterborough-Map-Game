# Commercial Readiness Checklist

Reviewed against application: **v1.6.46**

This is the go/no-go checklist for a paid fire-department deployment and the master hardening roadmap used for future releases.

## Master hardening roadmap

| # | Workstream | Status | Release / next action |
|---|---|---|---|
| 1 | Trusted department analytics identity | Complete | v1.6.40 — browser/query values cannot impersonate a department |
| 2 | Analytics permission authority | Complete | v1.6.40 — browser input may opt out but cannot enable collection beyond deployment policy |
| 3 | Privacy-before-analytics startup ordering | Complete | v1.6.41 — analytics fails closed until privacy authority is ready |
| 4 | Canonical bootstrap/cache consistency | Complete | v1.6.42 — CI rejects stale player-surface bootstrap versions |
| 5 | Deterministic EMS CI transitions | Complete | v1.6.43 — deterministic dispatch fixture plus permanent EMS stress gate |
| 6 | Central sensitive/simulated incident presentation | Complete | v1.6.44 — HUD, speech, popups, route review and history share one formatter |
| 7 | Local training-session history | Complete | v1.6.45 — bounded local history with safe presentation, export and storage fallback |
| 8 | Geo Guesser direct-entry commercial map policy | Complete | v1.6.46 — core gameplay/editor map creation uses a provider boundary; wrappers remain defense-in-depth |
| 9 | Geo Guesser / Firestore leaderboard rules-query compatibility | Open — high priority | Redesign public score collection/query and prove security rules with Firebase Emulator tests |
| 10 | Remove stale CI skip patterns | Open | Update or delete the four obsolete assertions instead of permanently suppressing them |
| 11 | Make commercial-readiness audit a normal deploy gate | Open | Classify demo blockers vs department blockers and run the audit before Pages publication |
| 12 | Publish only a production Pages artifact | Open | Build an allowlisted `_site` artifact instead of uploading the entire repository |
| 13 | Provider-aware attribution across all map surfaces | Partial | Geo Guesser supports configured attribution; consolidate the remaining simulator/editor provider metadata |
| 14 | Dispatch Editor HTML escaping cleanup | Open — low risk | Correct the remaining `&quot;` escaping defect and add a round-trip test |
| 15 | Legal/privacy/document release consistency | Open | Separate document revision from application version and automate reviewed-build stamping |
| 16 | Secure department analytics ingest/admin backend | Pre-sale blocker when analytics is enabled | Authenticated ingest, server-side tenant identity, schema validation, retention and admin authorization |
| 17 | Commercial map credentials/provider account setup | Pre-sale blocker | Obtain/restrict satellite credential and configure SLA/commercial/self-hosted street tiles |
| 18 | Copyright, licensing, contracts and branding review | Pre-sale blocker | Ownership audit, customer terms, privacy/DPA/liability/procurement review and branding permissions |
| 19 | GitHub Actions dependency maintenance | Monitor | Hosted runners warn that several current action majors target deprecated Node 20; upgrade when supported majors are available/validated |

### Roadmap rule

Complete unresolved high-priority security/data-integrity items before lower-priority packaging and documentation cleanup unless a release-blocking regression is discovered. Every completed workstream must gain regression coverage before it is marked complete.

## Already implemented in the repository

- training-only / not-for-live-response disclaimer
- simulated-incident / no-actual-incident disclaimer
- sensitive incident location framing while preserving useful geographic landmarks
- centralized incident presentation for HUD, dispatch speech, map popups, route review and local history
- local training history stored in-browser with bounded retention and JSON export
- automatic map-provider attribution foundations
- CARTO disabled unless current authenticated configuration is supplied
- department/commercial map fail-closed policy
- Geo Guesser core map-provider enforcement for direct, desktop, mobile and online entry paths
- ArcGIS authenticated satellite-provider configuration path
- production street-tile-provider configuration path
- department analytics default off until explicitly enabled
- browser/query input cannot impersonate a trusted department deployment
- browser/query input cannot enable analytics beyond deployment policy
- privacy authority initializes before analytics and analytics fails closed if that authority is unavailable
- no persistent cross-visit analytics player/browser ID
- public department leaderboard disabled by default
- nickname/alias public leaderboard wording
- admin stats page no longer treats localStorage as authentication
- direct browser administrative Firestore reads disabled by the secure stats policy
- target Firestore production rules checked into the repository
- canonical player-surface build/cache consistency checks
- deterministic EMS regression/stress testing
- root third-party notices
- commercial licensing/copyright-audit guidance
- automated commercial-readiness audit available in the repository

## Required before the first paid deployment

### Map providers

- [ ] Create/configure a commercial ArcGIS Location Platform credential (or replace satellite provider with another appropriately licensed service).
- [ ] Restrict the map credential to the required services/origins as supported by the provider.
- [ ] Choose/configure an SLA/commercial/self-hosted street tile service and set `osmTileUrl`.
- [ ] Configure provider-specific attribution metadata for every selected map provider.
- [ ] Confirm `window.PTBO_MAP_READINESS.readyForCommercialMaps === true` in the customer deployment.
- [ ] Verify attribution on desktop/mobile, Geo Guesser, Dispatch Editor and every available map mode.

### Analytics/security

- [ ] Resolve the public Geo Guesser leaderboard query/security-rule design and prove it with Firebase Emulator tests.
- [ ] Decide whether the customer deployment has analytics enabled and document that decision in the customer privacy/data schedule.
- [ ] Build/configure an authenticated server-side analytics ingest endpoint.
- [ ] Build/configure real administrator authentication/authorization for the stats endpoint/dashboard.
- [ ] Validate/rate-limit analytics writes server-side.
- [ ] Test retention/deletion for the selected retention period (repository target: 180 days for raw/session-detail analytics).
- [ ] Deploy `firestore.rules` only after secure ingest/admin access and compatible leaderboard queries are ready.
- [ ] Verify unauthenticated `siteAnalytics` reads/writes fail after rule deployment.
- [ ] Consider App Check/authenticated submission or a backend for the public-demo scoreboard if public usage becomes significant.

### Release engineering

- [ ] Remove the four stale CI skip patterns by updating or deleting their obsolete assertions.
- [ ] Run the commercial-readiness audit automatically before normal Pages publication.
- [ ] Replace the current whole-repository Pages upload with an allowlisted production `_site` artifact.
- [ ] Keep canonical build/cache consistency checks in every production deployment.
- [ ] Keep Geo Guesser map-provider regression tests and EMS stress tests in every production deployment.
- [ ] Monitor GitHub Actions runtime deprecations and update action majors when validated replacements are available.

### Intellectual property / contracts

- [ ] Complete contributor/copyright ownership audit before changing GPL/dual-licensing structure.
- [ ] Preserve third-party licence files/notices/attribution.
- [ ] Obtain written approval before using official municipal/department logos, crests, patches or other protected branding in a paid deployment.
- [ ] Have a software/IP lawyer review the proposed commercial licence/subscription agreement.
- [ ] Include training-only, no operational reliance, privacy/security, IP, support, payment and limitation-of-liability terms in the customer agreement.
- [ ] Confirm insurance/procurement/vendor-security requirements requested by the customer.

### Customer data/content

- [ ] Get department approval for customer-supplied stations, bases, hospitals, call scenarios, logos and other deployment content.
- [ ] Do not ingest real CAD/patient/incident records into the normal product analytics pipeline.
- [ ] Keep fictional-incident and landmark disclaimers visible.

## Recommended pre-sale acceptance test

For each department deployment:

1. Open desktop simulator and mobile simulator.
2. Verify Fire and EMS base spawning.
3. Verify dispatch workflow, route comparison, local training history and camera-follow controls.
4. Open Geo Guesser through desktop/mobile/online wrappers and its direct core URL; confirm all use the configured department street provider.
5. Verify satellite and street map modes use configured commercial providers.
6. Inspect provider attribution on every map surface.
7. Confirm training/simulation disclaimer is visible.
8. Confirm sensitive fictional incidents use safe landmark framing in HUD, spoken dispatch, popups, route review and history.
9. Confirm analytics state and trusted department identity match the customer deployment configuration.
10. Confirm public leaderboard state and Firestore query/rules behavior match the customer configuration.
11. Confirm admin stats cannot be opened without real authenticated access.
12. Run `node tools/commercial-readiness-audit.mjs`.
13. Run the complete production regression suite and Firebase Emulator security tests.
14. Inspect the built Pages/customer artifact and confirm only intended production files are present.
15. Review the customer-specific licence/privacy/config package before launch.

## Release blocker rule

Do **not** represent a department deployment as commercially ready if any of these are unresolved:

- commercial map provider configuration
- incompatible or untested Firestore leaderboard/security rules
- secure analytics/admin architecture when analytics is enabled
- customer contract/privacy terms
- unresolved copyright/relicensing ownership questions for the intended distribution model
- required permission for official customer branding
