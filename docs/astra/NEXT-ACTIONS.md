# Next Actions

Updated: 2026-09-08

## Completed before Astra
- Regular ChatGPT inspected the current repository and Station 1 reference/survey system.
- Production/runtime regressions blocking a trustworthy baseline were repaired in **v1.6.39**.
- GitHub Pages regression gate is green: **69/69 tests passed**.
- v1.6.39 deployed successfully from commit `eecace29927d71776bc3380aaec855fc39ffdac3`.
- Station 1 remains the first bounded visual-fidelity pilot.

## Priority order
1. **Astra Phase 1A — capture only what regular ChatGPT cannot.** Use the exact v1.6.39 commit in `ASTRA-EXECUTION-PACKET.md`. Do not redesign or research. Capture the six Station 1 named views with reproducible camera/FOV metadata, then measure full-profile and forced-lite browser performance on the same machine. Return the factual receipt and stop.
2. **Regular ChatGPT — independent visual critique.** Compare the six fresh renders against the calibrated Ontario 2023 orthophoto and suitable same-view street references. Produce resemblance-first P0–P3 work orders.
3. **Regular ChatGPT — synthesize the correction packet.** Update `VISUAL-QA.md`; turn only high-confidence P0/P1 findings into concrete geometry/material/placement work orders; separate fixes that can be made directly through GitHub from those that genuinely need live 3D/Blender iteration.
4. **Regular ChatGPT first / Astra only where needed — Station 1 correction pass.** Implement safe code/data corrections in regular ChatGPT. Reserve Astra for authored mesh/detail work or live visual iteration. The next production code update after v1.6.39 is v1.6.40.
5. **Astra Phase 1B — verification render.** Re-render the same six named views and repeat the same performance measurements after corrections. Keep camera definitions unchanged.
6. **Regular ChatGPT — acceptance review.** Re-run the fresh-context critic, close/retain work orders and decide whether Station 1 passes the pilot criteria.
7. **After Station 1 passes:** select the next bounded fidelity district with strong lawful references and high recognition/training value.

## Exact next production phase
**Phase 1A — Station 1 Reproducible Baseline Capture (render/measure only)**

### Astra deliverables
- `S1-AERIAL-NORTH`
- `S1-APPARATUS-FRONT`
- `S1-PUBLIC-ENTRY`
- `S1-YARD-CONTEXT`
- `S1-PLAYER-SPAWN`
- `S1-SURVEY-OVERLAY`
- per-view camera/FOV/quality metadata
- full-profile and `?lite=1` runtime measurements
- base/final commit and final `git status --short`

No broad redesign, reference research, code optimization, visual scoring or project-document rewriting belongs in this Astra session.
