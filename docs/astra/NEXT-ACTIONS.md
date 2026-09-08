# Next Actions

Updated: 2026-09-08

## Priority order
1. **Astra Phase 1A — capture the current Station 1 baseline.** Sync the exact base commit from `ASTRA-EXECUTION-PACKET.md`, run the current City Explorer without redesigning it, capture the six required Station 1 named views with camera/FOV metadata, and record desktop/full plus forced-lite performance. Return a factual session receipt and stop.
2. **Regular ChatGPT — independent visual critique.** Compare the fresh named renders against the Ontario 2023 orthophoto and any suitable street-level references supplied for the same views. Produce P0–P3 work orders; do not score beauty.
3. **Regular ChatGPT — synthesize the correction packet.** Update `VISUAL-QA.md`, convert only high-confidence P0/P1 findings into concrete geometry/material/placement work orders, and decide which fixes can be made directly in GitHub before using Astra again.
4. **Regular ChatGPT first / Astra only where needed — Station 1 correction pass.** Implement code/data corrections that do not require local visual authoring in regular ChatGPT. Reserve Astra/Blender for authored mesh/detail work or changes that require live visual iteration. Any production code change increments the version exactly 0.0.1.
5. **Astra Phase 1B — verification render only after corrections.** Re-render the same six named views and repeat the same performance measurements. Do not change camera definitions between before/after comparisons.
6. **Regular ChatGPT — acceptance review.** Re-run the fresh-context critic; close/retain work orders and decide whether Station 1 has passed the pilot criteria.
7. **Only after Station 1 passes:** select the next bounded fidelity district. Prefer a district with strong lawful references and high training/recognition value; do not default to splats unless an approved capture actually exists.

## Exact next production phase
**Phase 1A — Station 1 Reproducible Baseline Capture**

Goal: establish current visual and performance truth before spending credits on new 3D work.

Deliverables from Astra:
- six named Station 1 renders;
- per-view camera/FOV/quality metadata;
- full-profile and `?lite=1` baseline measurements;
- base/final commit and git status;
- no broad redesign and no self-authored visual score.

The detailed execution prompt is `docs/astra/ASTRA-EXECUTION-PACKET.md`.