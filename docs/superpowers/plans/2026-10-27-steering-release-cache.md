# Steering release cache follow-up — v1.6.136

Publishing v1.6.135 was authorized by the user. Its Pages deployment succeeded, and the live homepage showed v1.6.135. The live simulator DOM then exposed vehicle loaders requested under old v1.6.15/v1.6.13 cache tokens, including nested core/tuning assets under v1.6.15. A version badge alone did not prove the repaired control assets were refreshed.

Root cause: the wrappers' legacy readiness script used its internal VERSION15 for vehicle-loader requests; shared/stations used internal VERSION13. The nested loader preferred those obsolete query tokens over the canonical build identity. Fix the two observed injector paths and give the canonical build priority inside the loader. Retain source-token/version fallbacks for older standalone embeds.

Three new executable regression cases failed before these changes. All 21 focused steering/cache cases and all 767 Node tests passed afterward, with no failures/skips. Changed modules parse and diff checks pass. Independent review reproduced the 21 passes and found no material issues in this patch. Release references are normalized to 1.6.136.

The user-authorized publish includes this necessary cache repair. Final deployment/asset-loading receipts are collected separately after the Pages job completes. No physical-phone multi-touch pass is claimed.

Unrelated existing limitation: City Explorer Browser QA failed at startup on both prior main v1.6.132 (run40435127649) and v1.6.135 (run40504205608), with the same "Adding official parks..." stage and no page errors. The smoke test's mispositioned timeout argument leaves a 30-second default; causality of one unidentified HTTP403 remains unknown. This is not evidence of a D01 steering regression, and the later 3D browser checks were skipped. Do not claim all-mode browser QA passed.

Legacy follow-up outside the canonical mobile/play path: dedicated base-training/index.html still requests a fixed v1.6.19 vehicle loader. The canonical UI does not use that dedicated legacy entry.
