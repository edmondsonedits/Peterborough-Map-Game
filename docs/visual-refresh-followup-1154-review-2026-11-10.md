# Independent follow-up review — November 10, 11:54 pass

Latest remote ledger and plan read before work. Code candidate: v1.6.205, `1311f758366b1031b10a287cdf473a27b8bfd678`. Primary implementation ownership remains active through 13:57 America/Toronto. This follow-up used two read-only agents and did not edit reserved source, capture files, ledger or plan. No code version increment is warranted for this documentation-only checkpoint.

## New actual pixel evidence

Reviewed v1.6.204 `f7d96109db18058c425a767976899a5f34a5f55c`, not v205. Artifact 13784427425 from https://github.com/edmondsonedits/Peterborough-Map-Game/actions/runs/42855146899 contains 24 Sherbrooke Balanced PNGs, including eight actual cab views. All eight cab JSON records identify shared/explorer version 1.6.204, camera AGL 2.435–2.612 m, no context loss. Draw counts range 233–835 and triangles 1,731,961–2,162,205; these are software-renderer observations, not a mobile performance acceptance result. Report has no page, HTTP, critical-console or critical-request errors. Aborted external recaptcha requests are recorded separately.

Reviewer inspected all eight original cab PNGs and R142/R143/R159 obliques against owner photos R137, R138, R141, R142, R143, R144, R157, R159 and R190 and the ready-fronts register. Image root: `qa-captures/f7d9610/evidence/current/balanced/sherbrooke/`. Owner photos: `handoff/extracted/R###.jpg`.

**Decision: visual quality not approved.** Findings below are source-fit gaps, not established new regressions: matched baseline pixels were unavailable to this review.

| Priority | Capture stem | Finding / required correction |
|---|---|---|
| P1 | sherbrooke-r143-1006575767 | R143/R144 low bungalow becomes a very tall blank red wall above low openings. Cab and oblique support auditing source wall height before facade polish. |
| P1 | sherbrooke-r142-1006594188 | Source street-facing gable becomes rectangular eave face; oblique shows ridge running along street. Audit roof orientation. Five opening positions and chimney-colored band are present. |
| P2 | sherbrooke-r141-1006575766 | Large triangular pale mass appears above source's nearly flat dark eave. Two upper windows and deliberately blank lower wall are preserved. |
| P2 | sherbrooke-r159-1006575755 | Source flat/parapet top becomes substantial gable. Arches, keystone markers and four principal opening fields render; photographed concrete retaining edge/elevation relationship remains absent. |
| P2 | sherbrooke-r157-1006594168 | Thrive glass fields, central pier, mullions and green strips render, but verified lettering remains deliberately deferred; generic triangular roof contradicts flat commercial frontage. Incomplete identity, not proven sign-renderer failure. |
| P2 | sherbrooke-r138-1006575786 and R142/R143 | Siding/brick reads nearly uniform. LAUNDROMAT remains plainly readable and its shop bay/upper openings/east door are present. Diagnose material contrast without asserting shader failure from pixels. |
| P2 | sherbrooke-r190-755554888 | Long dark loading return correctly avoids duplicate yellow branding. Photo's high concrete retaining edge is missing; green foreground remains. Do not infer a drivable opening from dark pixels. |
| QA | sherbrooke-r137-1006594206 | Cab crops Dominion's name and upper facade at right/top. Add farther-back or angled actual cab pose before whole-facade approval. |

R143 correctly uses a central door rather than old patch's erroneous third window; R142 retains tiny fifth opening; R159 does not invent a central entry. Preserve these accepted bounded details while correcting massing.

## Capture audit

Second agent read exact committed v204 harness and workflow. No current-only route-frontage wait defect found in baseline:
- Baseline serves immutable 4da1b86 and disables cab capture.
- Material readiness and sign/frontage audits are gated by cab mode.
- Walmart ground readiness requires the newer driver hook; baseline skips it.
- Generic settle checks rendering and road readiness.
- Four capture jobs run concurrently; 30-minute capture and 35-minute job limits apply.
- Earlier baseline artifact has 49 completed views and roughly 850 ms median frame interval. Slow software rendering is plausible, not a confirmed diagnosis of the current running jobs.

Do not remove readiness gates to accelerate captures. Diagnose last preserved view/log if jobs fail.

## CI snapshot and next work

v204 vehicle/multiplayer regressions, Station 1 driving, solo and multiplayer smoke jobs succeeded. Current Balanced Chemong north/south, Reid and Sherbrooke capture jobs succeeded; Water and baseline cohorts were still running, Lite queued at query time. This is not whole-workflow success.

v205 browser run https://github.com/edmondsonedits/Peterborough-Map-Game/actions/runs/42859272929 remained queued at final status check; asset build in progress. No v205 pixels or Water/Lite pixels were reviewed here.

Owning implementer should prioritize roof/height source audits and the cropped Dominion capture, preserve established opening corrections, and obtain exact-revision matched Balanced/Lite cab evidence after corrections. Do not apply old app.js/release normalization wholesale. No merge, production deployment or quality approval occurred in this follow-up. Original cutoff remains November 10 at 13:57 America/Toronto.
