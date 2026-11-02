# Plausible citywide buildings implementation plan

> For agentic workers: use superpowers:subagent-driven-development. User explicitly delegates visual judgment and requests efficient agents and iterative review.

**Goal:** Improve every eligible ordinary building through a shared, plausible regional visual grammar; exact real-world likeness is not required.
**Architecture:** Extend existing deterministic facade/material batching and bounded irregular-roof builder. Preserve GIS footprints, surveyed dimensions, collision, authored GLBs, and reviewed footage. Use shared textures and bounded geometry; no per-building photo research or unique model downloads.
**Tech Stack:** Existing Three.js, JavaScript modules, Node tests, standalone Playwright.
**Spec:** User 2026-11-02: sensible architectural guesses, realistic attractive buildings, efficient agents, critique and improvement. Earlier low-quality/high-performance requirement remains.

## Constraints and review focus
- H access only H:/ChatGPT. Existing isolated facilities-release checkout is baseline at a9c3462 after the asset refresh.
- Preserve five researched replacements, all Fire/EMS facilities, reviewed custom facades and footage.
- Changes cover citywide eligible ordinary buildings, including pilot; no tiny neighborhood-only pass.
- Infer style honestly. Respect building use, explicit roof tags/heights, footprint bounds and holes.
- Avoid one material or texture per building; maintain merged batches and far-distance detail culling.
- Review small homes, complex footprints, apartment blocks, retail, industrial, ancillary structures, slopes, and both balanced/low profiles.

## Tasks
- [x] One Luna implementation worker owns facade/roof rules, existing shared texture factories, app integration and relevant tests. Fix sparse/budget-starved facades, missing entrances and complex-house flat roof fallback; add restrained coordinated variation.
- [x] Parent owns QA scripts/reports. Capture baseline and changed representative cases, compare coverage, geometry/material/texture counts, loading/runtime errors, and station departure.
- [x] Critique visuals and return concrete defects to worker; repeat affected checks only. Use independent review after implementation where justified.
- [ ] Publish accepted citywide changes under the continuing authorization to publish completed buildings; verify public hashes and live smoke. Do not claim exact real-world likeness or physical-device performance.
