# Private Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build optional player accounts and private in-game developer conversations.
**Architecture:** A shared lazy UI loads a Firebase service. Atomic thread/message writes are authorized by separate feedback-only Firestore rules; permanent registration links guest identity.
**Tech Stack:** Browser ES modules, Firebase JS SDK 12.5.0, Firebase Auth/Firestore, Node test, Playwright, Firebase Emulator Suite.
**Spec:** docs/superpowers/specs/2026-10-26-private-feedback-design.md

## Global Constraints
- No guest cache-clearing warnings.
- Authentication never gates gameplay.
- Guest registration retains UID/history; existing account sign-in does not silently merge identities.
- No private data is fetched then filtered for access control in the client.
- Do not deploy unrelated analytics security migrations.
- One canonical release increment of 0.0.1.

## Review Focus
- A player guessing another thread ID cannot read it or its messages.
- A player cannot forge developer replies, change ownership, or reset unread counters.
- Failed sends and ambiguous acknowledgements preserve drafts without duplicate messages.
- Sign-out/account switches detach listeners and immediately clear old private content.
- The inbox cannot steer the truck or overflow a phone viewport.

### Task 1: Model and enforced data boundary
Files: feedback/model.mjs, feedback/service.mjs, feedback/config.mjs, feedback/firestore.rules, feedback/firestore.indexes.json, feedback/firebase.json, tests/feedback-model.test.mjs, feedback/tests/rules.test.cjs.
Interfaces: normalizeNewThread(input,context), filterThreads(threads,filters,uid,isDeveloper), unreadCount(thread,role), createFeedbackService(config). Service exposes ready, account, subscribeAccount, register, signIn, signOut, resetPassword, watchThreads, loadThreads, watchMessages, loadMessages, send, markRead, updateThread, addNote, watchNotes.
- [x] Write and run failing model and real-emulator privacy tests.
- [x] Implement validation and atomic writes. Test forged ownership/roles, orphan writes, timestamps, rate limits, notes, immutable history, and owner-scoped queries.
- [x] Verify passing model and emulator suites.

### Task 2: Shared player and developer interface
Files: feedback/ui.mjs, feedback/styles.css, feedback/index.html, shared/build-version.js, tests/feedback-browser.cjs.
Interfaces: mountFeedback({rootUrl,config,service}) installs menu controls and returns open/close. Production service uses pinned Firebase modules; emulators are localhost-only explicit config.
- [x] Write failing browser scenarios: guest skip, registration preserves threads, separate users, developer response, unread/read, failed-send retry, sign-out privacy, mobile bounds, menu attachment, keyboard containment.
- [x] Implement responsive dialog, native forms, real-time listeners, context editing, pagination, developer filters/status/priority/private notes, and launcher account chooser.
- [x] Run browser scenarios against real Auth/Firestore emulators; inspect screenshots.

### Task 3: Release and activation
Files: feedback/README.md, feedback/set-admin.cjs, tools/feedback-tests/package.json, canonical release references normalized by scripts/normalize-release.cjs.
- [x] Document provider setup, Firestore deployment/indexes, admin claim, safe feature activation and live verification.
- [x] Bump version; run meaningful existing release/gameplay regressions and available full Node suite, report baseline failures.
- [x] Obtain independent review, fix significant findings, verify final diff, and deliver branch/PR if deployment credentials are unavailable.
