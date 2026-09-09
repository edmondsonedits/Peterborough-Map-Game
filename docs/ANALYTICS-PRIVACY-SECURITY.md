# Analytics Privacy & Security

Release: **v1.6.42**  
Purpose: keep useful department-level product analytics while avoiding unnecessary firefighter identity tracking and public/raw administrative data access.

## Product policy

Emergency Games should measure **how the product is used**, not build individual firefighter profiles.

Approved analytics categories:

- department/deployment identifier supplied through trusted deployment setup
- anonymous player/session counts
- session and active-play duration
- city and Fire/EMS mode usage
- calls started/completed/abandoned
- aggregate response and transport timing
- aggregate distance/driving/stationary time
- feature, control and settings usage
- device surface/browser family/screen-size bucket
- startup success/failure and aggregate reliability events

Do not collect for product analytics:

- firefighter names, emails or employee numbers
- exact driven routes or stored GPS traces
- exact incident/player coordinates
- IP-derived department identity
- browser/query-string supplied department identity
- prompts, room codes or free-form personal text
- persistent cross-visit browser/player identifiers
- real operational incident/CAD records unless a separate approved data product is designed and contracted for that purpose

## Current client behaviour

`shared/analytics-privacy-upgrade-1.6.33.js` contains the active v1.6.40 privacy/authority policy layer. The filename is retained temporarily for compatibility; v1.6.42 keeps the privacy-first loader ordering and adds canonical bootstrap cache-version enforcement.

- Public demo analytics remains enabled by default.
- Department/private/commercial deployments default analytics **off** unless trusted deployment configuration explicitly permits it.
- A department deployment can explicitly permit analytics with `PTBO_DEPLOYMENT.analyticsEnabled = true` after the department has been informed of the telemetry policy.
- `PTBO_DEPLOYMENT.department` is the only trusted browser-side department label. `?dept=`, `?department=` and previously persisted department labels cannot override it.
- Browser/runtime controls cannot turn analytics on when deployment policy disallows it.
- `?analytics=off` and a local runtime opt-out may reduce collection when the deployment permits analytics; lower-trust input cannot increase collection beyond the deployment policy.
- Persistent legacy visitor identifiers are removed.
- Administrative stats reads fail closed unless an authenticated secure stats integration is present.
- Recommended raw/session-detail retention target: **180 days**, followed by deletion or aggregation where practical.

Example deployment:

```html
<script>
window.PTBO_DEPLOYMENT = {
  mode: 'department',
  department: 'peterborough_fire',
  analyticsEnabled: true,
  publicLeaderboardEnabled: false
};
</script>
```

Do not identify a department by IP address or a user-editable URL parameter. Give each deployment an explicit organization/deployment ID instead.

### Authority hierarchy

For analytics decisions, the deployment sets the maximum permitted collection level. Browser-controlled state may only reduce collection.

1. trusted deployment policy
2. department/application policy defaults
3. user opt-out where permitted
4. debug/query input

A lower-trust source must never override a higher-trust source to increase telemetry or change the trusted department identity.

### v1.6.42 bootstrap and cache ordering

The canonical launcher no longer includes `site-analytics-1.6.25.js` directly. Analytics is started through the shared bootstrap only.

The shared bootstrap now enforces this sequence:

1. request the privacy/authority policy
2. positively verify that `PTBO_ANALYTICS_PRIVACY` initialized with its required API
3. only then load the legacy analytics implementation
4. reuse one installation promise if startup is requested more than once
5. leave analytics unavailable if privacy initialization fails

The page bootstrap also avoids the previous immediate-plus-`DOMContentLoaded` double invocation path. This removes the known v1.6.40 startup race on canonical entry points. Regression tests in `tests/analytics-bootstrap.test.cjs` and `tests/analytics-adversarial.test.cjs` verify the ordering contract, delayed-client behavior, storage failure handling, idempotence, and fail-closed behavior.

Every canonical player surface now has a CI-enforced `build-version.js` cache key matching the production release. `tests/release-bootstrap-consistency.test.cjs` fails deployment if a canonical launcher, simulator wrapper, Geo Guesser surface, or City Explorer falls behind. Historical/archived wrappers may retain their own compatibility versions; generated release stamping remains a future simplification opportunity.

## Secure commercial architecture

Before a paid department deployment, migrate analytics writes away from browser-direct Firestore writes.

Recommended flow:

1. Browser generates only a short-lived session identifier.
2. Browser sends an allowed aggregate telemetry event/session summary to an authenticated HTTPS endpoint.
3. Endpoint authenticates the deployment, validates the schema and values, rejects unexpected fields, and rate-limits abuse.
4. Endpoint adds trusted server metadata such as deployment ID and server timestamp.
5. Endpoint writes to Firestore/Admin storage using server credentials/IAM.
6. Raw analytics collections are not publicly readable.
7. The admin dashboard reads only through an authenticated admin endpoint or authenticated Firebase client with an admin claim.
8. Scheduled retention deletes or aggregates records older than the chosen retention period.

## Secure stats interface

`site-stats/index.html` no longer uses localStorage as authentication and no longer reads Firestore directly.

A private deployment should provide an authenticated integration exposing:

```js
window.PTBO_SECURE_ANALYTICS = {
  authorized: () => true,
  loadStats: async () => ({
    departmentCount: 1,
    playerSessions: 120,
    activeSeconds: 42000,
    callsCompleted: 460,
    distanceMeters: 920000,
    fireCalls: 310,
    emsCalls: 150,
    startupFailures: 2,
    departments: {
      peterborough_fire: 120
    }
  })
};
```

`authorized` must represent real server-backed authentication/authorization, not a hidden URL, localStorage value or JavaScript-only password.

## Firestore rules

The repository includes `firestore.rules` and `firebase.json` as the **target production security baseline**.

Important: do **not** deploy the new `siteAnalytics` deny-write rule until secure server-side analytics ingest is ready, otherwise legacy browser analytics writes will stop. That is intentional fail-closed behaviour for production, but it should be introduced as a planned migration.

Recommended migration order:

1. Build/test secure analytics ingest endpoint.
2. Build/test administrator authentication and secure stats endpoint.
3. Confirm department analytics are opt-in/enabled only where intended.
4. Verify required metrics arrive through the secure path.
5. Deploy `firestore.rules`.
6. Confirm direct unauthenticated `siteAnalytics` reads/writes fail.
7. Confirm authenticated admin stats still work.
8. Enable retention/deletion automation.

## Geo Guesser leaderboard

The public-demo leaderboard is separate from private department analytics.

Current policy:

- asks for a **nickname / alias**, not a real name
- limits names to 30 characters
- disables public leaderboards by default for department/private deployments
- department nickname storage is session-only
- validates score/time ranges client-side
- repository Firestore rules are a target security baseline and must be tested against the final leaderboard query design before deployment

For a larger public launch, move score writes behind Firebase App Check/authenticated or server-side rate-limited submission to reduce spam/abuse risk.

## Department-facing privacy notice

Before paid use, provide the department a short written privacy/data schedule covering:

- what is collected
- why it is collected
- which provider(s) store/process it
- retention period
- who can access the admin dashboard
- deletion/export/contact process
- confirmation that real emergency-response/CAD data is outside normal product analytics

The final department agreement and privacy language should be reviewed for applicable Canadian/Ontario privacy and procurement requirements.
