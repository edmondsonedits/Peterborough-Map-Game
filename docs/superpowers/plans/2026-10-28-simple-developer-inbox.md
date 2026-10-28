# Simple Developer Inbox Implementation Plan

> Use superpowers:executing-plans; browser verification may run independently.

Goal: one clear developer inbox with efficient mobile list and conversation views.
Spec: ../specs/2026-10-28-simple-developer-inbox-design.md

- [x] Add role/queue/filter/pagination tests that fail against the previous UI.
- [x] Remove role toggle, simplify sidebar and thread tools, coalesce scans and bound DOM rows.
- [x] Replace modal header height assumptions and test mobile/desktop layout, keyboard and back focus.
- [x] Run existing privacy/unread/race/browser regression checks and independent review.
- [ ] Publish normalized v1.6.149 and verify live source and mobile layout.

Validation: 145 Node/DOM/release checks, nine UI race scenarios, browser checks with 149 conversations at 338×656, 390×844 and 1000×800, guest UI, and the real Auth/Firestore message/demo/transfer/privacy flow. Existing compact report layouts still pass. Stats links to the same unfiltered developer inbox.

Independent review found two mobile issues: list position was measured after hiding the list, and action errors targeted the hidden sidebar. Both were reproduced with failing browser tests and fixed. Back now restores a scrolled 35th row and keyboard focus; status failures display in the active conversation. The reviewer’s focus suggestion was also addressed. No role, data schema, or Firestore rule changes.
