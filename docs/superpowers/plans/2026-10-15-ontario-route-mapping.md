# Ontario Route Mapping implementation

Spec: ../specs/2026-10-15-ontario-route-mapping.md

- [ ] Build all 33 topology-preserving OSM road packs and authoritative legacy base catalogs.
- [ ] Implement shared practical routing, legality, tracing and cost-consistent grading/learning.
- [ ] Preserve canonical metadata/saves and organize editor calls by city/base.
- [ ] Integrate selected-city manifests, deferred network/game loading and homepage links.
- [ ] Generate exactly three meaningful exercises for each active base and audit the evidence.
- [ ] Run all tests, all-city browser/editor/mobile QA and independent branch review.
- [ ] Normalize version, publish reviewed tree and verify CI/live assets and games.

Interfaces: city route manifest schema1 links network/profile versions, baseAccess and coverage; canonical calls carry routeAccess and routeChallenges. Network FeatureCollection retains OSM node identity, controls and turn restrictions. The cost core and app VM graph are shared by curation. Route availability is independent of simulator roads.

Review focus: stale metadata/same-version saves; legacy custom-call migration; base-edit invalidation; split-way U-turns and conditional restrictions; via-way incoming context; fractional endpoints; destination-only/private/busway access; island/rural routes; large-city memory and responsiveness; correct city namespace; cost-versus-distance learning; touch/desktop trace regression and overlay layout.

Recovery note: automated workspace maintenance removed the first unpublished implementation. Restore from published 5f37936489d9d0fa1e144fcb5fca19680c3b28ba and checkpoint this branch durably as work proceeds. Continue without repetitive approval requests: the user authorized the complete rollout and publication.
