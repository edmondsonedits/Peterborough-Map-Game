# Final integration review

Verdict: **approved; no remaining P1/P2 findings.** One P2 integration defect was found and independently re-reviewed after the assigned owner's fix. Read-only review against `384d097`; no production edits by this reviewer. Exact reviewed hashes, including the fix, are in `final-integration-review-inputs.json`. Ottawa's pending final Station 63 data was excluded.

## Closed finding

**P2 — Dispatch silently excluded the reviewed Island civic exercise.** The original `response-simulator/local-pool.js:15` admitted only `routeAccess.method === 'modeled-public-road-approach'`. The published and directed-audited `toronto-osm-node-13854671025` (355 Lakeshore Avenue) correctly uses `modeled-designated-emergency-road-approach`, preserving private access and `publicRoad:false`. Both Island base profiles included its first-due exercise, but their runtime Dispatch pools omitted it and returned only the three old intersection drills. The original `tests/local-pool.test.cjs:28` asserted that this published pool contained only intersections, masking the regression.

Reproduce from the repository root:

```js
const t = require('./cities/toronto/training-data.json');
const {localPool} = require('./response-simulator/local-pool.js');
for (const [id, service] of [
  ['fire-toronto-fire-335', 'fire'],
  ['ems-toronto-ems-4173463', 'ems'],
]) {
  const result = localPool(t, t.sharedLocations, {cityId:'toronto', id, service});
  console.log(id, result.some(c => c.canonicalCallId === 'toronto-osm-node-13854671025'));
}
// Before fix: both false. After fix: both true, plus three intersections each.
```

The owner's fix in `response-simulator/local-pool.js:4–11` accepts only the exact 355 source/address/point/reference/approach contract, the two intended Island base/service identities and the existing Toronto 33-way supplement/policy declaration. Both canonical and exercise metadata must agree. It preserves private access, `publicRoad:false` and modeled-entrance limits; the public-approach predicate remains unchanged. Sparse civic pools are combined with intersection fallback. No road-loader hash dependency or readiness race was introduced. The approved source-way/hash is verified offline, without claiming runtime cryptographic validation. The real published row is now tested for both services; fallback uses a separate fixture. New browser code independently exercises the published civic path before suppressing civic rows in memory for fallback coverage.

## Other reviewed integration

No further P1/P2 defect demonstrated in shared catalogue loading and city namespaces; saved-base number conflicts, aliases and tombstones; preview startup/canonical snapshots; local station/service isolation; scene arrival and no-transport EMS/history; dynamic scene filters; Route/Dispatch support labels; entrypoint/cache-version integration; or bounded source exceptions. Capability prose distinguishes Route one-way routing from Dispatch's unenforced one-way/turn rules, modeled access, no hospital transport in six cities, and browser endpoint checks versus a complete driven route.

An independent lightweight data scan of the 32 stable city descriptors checked 3,940 generated civic assignments: zero canonical address/coordinate/access mismatches, service-incident mismatches or missing selected support primaries. No supplemental row lacked its geographic reference/HTTPS sources. Only the accepted 355 Lakeshore exception is promoted; the seven directed-unreachable proposals are absent. Its source/private-access/scoped zero-clue evidence remains intact. Cambridge's letter-box profile is Fire Investigation.

The six scene cities have at least three runtime-eligible exercises at every published non-unavailable base (pre-fix Toronto minimum three, others six). Both Island pools now retain one civic exercise plus their three intersections. Existing matching correctness review remains applicable; it was not repeated. No additional material memory/selection risk was demonstrated without loading heavy graphs.

## Verification

`node --test tests/local-pool.test.cjs tests/scene-canonical-store.test.cjs tests/base-saved-roster-upgrade.test.cjs tests/shared-training-locations.test.cjs tests/legacy-preview-snapshot.test.cjs tests/training-history.test.cjs`: **58 passed, 0 failed** before the designated-approach fix. This passing suite misses the finding, as described above.

`node --test tests/ems.test.cjs tests/base-training-cities.test.cjs tests/route-station-selection.test.cjs`: **50 passed, 0 failed**, including the existing directed Peterborough EMS/hospital catalogue checks and scene-only completion path.

After the fix, `node --test tests/local-pool.test.cjs`: **8 passed, 0 failed**, including actual 355 acceptance at both bases, altered source/policy/access rejection, sparse civic retention with fallback, and the exact approved supplement SHA-256/source-way identity.

Root owns final complete suites, directed city audits and browser validation against the exact final inputs. This review does not claim those execution checks passed.

## Final EMS floor additions

The subsequently added bounded EMS top-up CLI/plan and actual Toronto/Ottawa scratch outputs were independently reviewed: **approved, no demonstrated P1/P2 defect**. See `response-floor-topup-review.md` and its hash manifest. Five focused tests passed; eight added calls preserve all older records and bring six mainland EMS halls to 12 distinct destinations. Preserve the first-run Toronto two-record provenance delta during promotion. Final directed scratch audits remain separate acceptance evidence.

## Station-egress fix

The subsequent native-QA Belleville Fire 3 defect and owner's collision fix were independently reviewed: **approved**. `roadInfoAtXY` retains its existing yard behavior for ordinary consumers; only active station-connector completion requests a road-only lookup. Yard movement keeps the connector active, legitimate maneuvering inside the configured origin yard remains free, actual mapped-road entry clears the connector, and outside-yard movement retains the existing narrow corridor/start-pad restrictions. The final refinement requires both previous and candidate positions in that same origin yard, preventing jumps into another yard. Yard object identity is stable within `baseYards`, and a roster refresh clears the connector. No broad collision bypass or new road geometry was introduced. The owner's native full-route check remains separate evidence.

Independent `node --test tests/critical-gameplay.test.cjs tests/ems.test.cjs` after the final refinement: **35 passed, 0 failed**. Coverage includes sideways yard movement, different-yard rejection, off-corridor blocking, traversal beyond the yard edge, real-road completion, and existing Peterborough EMS exits/hospital/yard and directed-catalogue contracts.

Reviewed SHA-256: `response-simulator/road-collision-core.js` = `1320ec0ceda0103d652754ea854cd27c07dffe4f5983a1cf9dd0f1f77143f4a1`; `tests/critical-gameplay.test.cjs` = `22f9d63136624744f868d4b213584329c4ce916dbc77e35a0ccd50a735987f46`.
