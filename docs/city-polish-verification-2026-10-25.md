# Easy city visual polish — verified 25 October 2026

Completed locally in `H:\ChatGPT\Peterborough-Map-Game-Sherbrooke`, branch `codex/sherbrooke-existing-city`. No deployment, publication or push. Existing concurrent edits were preserved. Immediate pre-pass snapshots and a new evidence folder keep this pass separate from the earlier reusable-system release.

## Retained improvements

**S03, 219 Sherbrooke:** removed the generated front posts, beam and balcony railing that visibly duplicated details already present in the photograph. The explicit `hidePhotoDuplicatedMembers` appearance flag hides only those members after successful photo loading. Porch and balcony slabs retain shallow depth. Loading and failure retain the procedural members; unreviewed profiles and legacy behavior remain unchanged. Original photograph bytes, mapped geometry and building identity were not altered.

**Shared ground materials:** replaced coarse square hash patches with the existing smooth noise for asphalt and grass, and added restrained smooth variation to concrete while retaining joints and fine-grain scales. Maximum full-strength brightness modulation remains bounded to +/-3.5%; lite uses its existing reduced strength. The result is subtly smoother ground tone. No textures, external assets, geometric detail or citywide budgets were added.

Colour matching and window adjustments were evaluated and left unchanged because fresh captures did not demonstrate a defect worth altering. Main runtime integration, lighting, facade presets and generic component code are byte-identical to the immediate pre-pass snapshots. Only three runtime modules changed: `city-material-library.js`, `reviewed-photo-appearance.js` and `sherbrooke-footage.js`.

## Before/after and measurements

Open [the local comparison gallery](http://127.0.0.1:8893/test-artifacts/city-polish-20261025/comparison.html). Evidence is preserved under `test-artifacts/city-polish-20261025/`: original baseline and final images/reports, `comparison-metrics.json`, the capture script, and pre-edit snapshots.

| Measurement | Desktop full | Narrow lite |
| --- | --- | --- |
| Resolution | 1500 × 950 | 430 × 900 |
| Matched views | 7 | 7 |
| Browser/console/HTTP errors | 0 | 0 |
| Draw-call change | 0 in every view | 0 in every view |
| Texture-object and shader-program change | 0 in every view | 0 in every view |
| Median frame interval before → after | 16.7 → 16.7 ms | 16.7 → 16.7 ms |
| Ready time before → after, single local sample | 51.370 → 51.356 s | 10.446 → 10.479 s |
| Encoded runtime JavaScript increase | 1,326 bytes | 1,326 bytes |
| Added image bytes / texture allocations | 0 / 0 | 0 / 0 |
| Existing reflection GPU estimate | unchanged: 688,128 bytes | unchanged: 0 |

The S03 visible duplicate geometry removal reduces submitted triangles by 156 in affected views. The meshes retained for photo-failure fallback are still allocated. The ground shader uses more arithmetic for interpolated noise; unchanged draw calls do not measure that cost. Frame samples are display capped, so no GPU-headroom claim is supported. Whole-scene texture VRAM is not measured. Loading numbers are observations from one run, not statistically established performance changes.

The seven fixed cameras cover road/pavement, S03 front and oblique, George Street storefront front and turn, roof/landscape context, and Rutherford residential surfaces. Camera, lighting, quality and resolution match between before and after. Street views are around 2.6 m, with dedicated lower pavement and elevated roof views. Night screenshots and entering/accelerating the truck confirmed the existing glass and driving workflow still function. Narrow lite was captured in desktop Chromium with D3D11, not on a physical phone.

## Verification and review

15 relevant tests passed together: shared materials, appearance/component contracts, reviewed-photo overrides, footage lifecycle and source-facade assets. New assertions cover S03 loading, success, failure, default and legacy behavior. JavaScript syntax and diff whitespace checks passed. The original source-photo hashes remain validated.

Two Luna High specialists worked in separate files, with root integration and sequential browser captures. The Sol Medium independent reviewer inspected the focused source diff and actual full/lite before/after pixels. Verdict: **Approve the scoped polish; no blocking findings.** The reviewer confirmed clear removal of the duplicate porch overlay, retained slab depth, stable storefronts and subtle smoother ground shading. Approval is limited to this tested local pass.

## Scope and remaining limits

The ground change propagates through the shared eligible asphalt, concrete and grass materials citywide; only the sampled areas were visually verified. Porch cleanup currently applies only to reviewed S03. Existing photo perspective, baked shadows, flat photographic posts and roof/massing mismatch remain. Plain residential walls and broader building reconstruction were deferred because they require work beyond this easy polish pass. No physical-device or whole-city visual-quality claim is made.

See [the authoring guide](city-visual-authoring.md#easy-polish-photographed-porch-overlaps) for the small profile setting and next-building checks. Leave the flag unset unless the source photo covers the members being hidden. `?visuals=legacy` remains the older overall visual fallback; it is not an exact reproduction of this pass's immediate baseline. Use the saved before images for that comparison.
