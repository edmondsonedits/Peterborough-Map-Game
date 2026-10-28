# Feedback workflow implementation
Spec: ../specs/2026-10-28-feedback-workflow-design.md

Global constraints: private per-player access; developer custom claim only; guest option; no guest cache warnings; immutable history; scoped feedback Firebase deployment; preserve unrelated gameplay; patch version bump; publish authorized by user.

Tasks:
1. Add failing DOM regressions for admin default and exact visible-message acknowledgement; implement UI/service changes.
2. Add full-queue filter tests and metadata search coverage; implement queue scanning, counts, priority and independent developer unread watcher.
3. Add exact editor link tests and selection; implement developer location navigation and complete agent JSON export.
4. Add emulator transfer tests before rules/service changes; implement authenticated grant, resumable owner move, retry UI and account-switch guards.
5. Run targeted suites, emulator/browser flows and release checks; fresh whole-branch review; fix substantive findings; deploy feedback rules, publish authorized source and verify live version.

Review focus: stale async identity work, premature read counters, forged ownership grants, replays, incomplete exports/search pages, editor links applying corrections, and production/source mismatch.
