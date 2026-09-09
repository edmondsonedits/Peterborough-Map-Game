# Analytics Privacy & Security

Release: **v1.6.37**  
Purpose: keep useful department-level product analytics while avoiding unnecessary firefighter identity tracking and public/raw administrative data access.

## Product policy

Emergency Games should measure **how the product is used**, not build individual firefighter profiles.

Approved analytics categories:

- department/deployment identifier supplied during setup
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
- prompts, room codes or free-form personal text
- persistent cross-visit browser/player identifiers
- real operational incident/CAD records unless a separate approved data product is designed and contracted for that purpose

## Current client behaviour

`shared/analytics-privacy-upgrade-1.6.33.js` is the active privacy policy layer for v1.6.37.

- Public demo analytics remains enabled by default.
- Department/private/commercial deployments default analytics **off**.
- A department deployment can explicitly enable analytics with `PTBO_DEPLOYMENT.analyticsEnabled = true` after the department has been informed of the telemetry policy.
- Persistent legacy visitor identifiers are removed.
- The privacy policy loads before the legacy analytics client.
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

Do not identify a department by IP address. Give each deployment an explicit organization/deployment ID instead.

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

v1.6.37:

- asks for a **nickname / alias**, not a real name
- limits names to 30 characters
- disables public leaderboards by default for department/private deployments
- department nickname storage is session-only
- validates score/time ranges client-side
- repository Firestore rules provide schema/range validation for transitional public score creation

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
