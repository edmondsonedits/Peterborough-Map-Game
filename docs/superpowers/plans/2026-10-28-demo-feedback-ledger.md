# Demo feedback execution record

Spec: ../specs/2026-10-28-demo-feedback-design.md
Plan: 2026-10-28-demo-feedback.md
Base: bd7e9c87819e1b2c6babfd3e07d32b471051784a

- Task 1 complete: controller tests observed failing before implementation; then 7/7 controller/model checks passed. Final Firebase emulator rule suite 23/23 passed, including guest demo ownership, real server timestamps, outsider denial and forged owner/category denial.
- Task 2 complete: adapter/homepage/DOM tests observed failing before wiring. Final focused Node/DOM/release suite 142/142 passed; additional gameplay/analytics/city regressions 107/107 passed. Nine browser race scenarios passed. Compact report QA passed at 338×656, 390×844 and 1000×800.
- Full actual Firebase Auth/Firestore browser flow passed: homepage demo send as guest, timestamp, developer inbox/filter/reply/private note, AI export, outsider denial, guest-to-existing-account preservation, identity receipt reset and developer own-account label. Existing guest/account/unread/offline recovery flows also passed. Browser test initial failures were fixture assumptions (Route Mapping is now playable in Oshawa; guests use sign-in/account creation rather than Sign out), corrected to match real user flows.
- Independent reviewer found no Critical/Important issues and one pending-action account-switch edge case. Corrected that issue before publication: identity replacement invalidates pending homepage tokens, while initial guest creation retains the active token; stale completions cannot clear a newer operation. Reproducing test observed RED then GREEN, final suite 142/142 and real browser flow green.
- Dedicated feedback rules compiled and deployed to peterborough-map-game-feedback. Only added `demo` to the category allowlist; preserved ownership, immutability, role and cooldown checks. Readback must match source before publish.
- Publication authorized by the user's existing request to make updates live, continued by this explicit implementation request. Old device data is deleted by the updated homepage/stats script on that browser's next load; no claim of remote access to the phone and no conversion into new messages.
