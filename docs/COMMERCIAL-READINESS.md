# Commercial Readiness Checklist

Release: **v1.6.37**

This is the go/no-go checklist for a paid fire-department deployment.

## Already implemented in the repository

- training-only / not-for-live-response disclaimer
- simulated-incident / no-actual-incident disclaimer
- sensitive incident location framing while preserving useful geographic landmarks
- automatic map-provider attribution
- CARTO disabled unless current authenticated configuration is supplied
- department/commercial map fail-closed policy
- ArcGIS authenticated satellite-provider configuration path
- production street-tile-provider configuration path
- department analytics default off until explicitly enabled
- no persistent cross-visit analytics player/browser ID
- public department leaderboard disabled by default
- nickname/alias public leaderboard wording
- admin stats page no longer treats localStorage as authentication
- direct browser administrative Firestore reads disabled by the secure stats policy
- target Firestore production rules checked into the repository
- root third-party notices
- commercial licensing/copyright-audit guidance
- automated commercial-readiness CI audit

## Required before the first paid deployment

### Map providers

- [ ] Create/configure a commercial ArcGIS Location Platform credential (or replace satellite provider with another appropriately licensed service).
- [ ] Restrict the map credential to the required services/origins as supported by the provider.
- [ ] Choose/configure an SLA/commercial/self-hosted street tile service and set `osmTileUrl`.
- [ ] Confirm `window.PTBO_MAP_READINESS.readyForCommercialMaps === true` in the customer deployment.
- [ ] Verify attribution on desktop/mobile and every available map mode.

### Analytics/security

- [ ] Decide whether the customer deployment has analytics enabled and document that decision in the customer privacy/data schedule.
- [ ] Build/configure an authenticated server-side analytics ingest endpoint.
- [ ] Build/configure real administrator authentication/authorization for the stats endpoint/dashboard.
- [ ] Validate/rate-limit analytics writes server-side.
- [ ] Test retention/deletion for the selected retention period (repository target: 180 days for raw/session-detail analytics).
- [ ] Deploy `firestore.rules` only after secure ingest/admin access is ready.
- [ ] Verify unauthenticated `siteAnalytics` reads/writes fail after rule deployment.
- [ ] Consider App Check/authenticated submission or a backend for the public-demo scoreboard if public usage becomes significant.

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
3. Verify dispatch workflow, route comparison and camera-follow controls.
4. Verify satellite and street map modes use configured commercial providers.
5. Inspect provider attribution.
6. Confirm training/simulation disclaimer is visible.
7. Confirm sensitive fictional incidents use safe landmark framing.
8. Confirm analytics state matches the customer configuration.
9. Confirm public leaderboard state matches the customer configuration.
10. Confirm admin stats cannot be opened without real authenticated access.
11. Run `node tools/commercial-readiness-audit.mjs`.
12. Review the customer-specific licence/privacy/config package before launch.

## Release blocker rule

Do **not** represent a department deployment as commercially ready if any of these are unresolved:

- commercial map provider configuration
- secure analytics/admin architecture when analytics is enabled
- customer contract/privacy terms
- unresolved copyright/relicensing ownership questions for the intended distribution model
- required permission for official customer branding
