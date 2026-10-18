# AI City Editor Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a bounded external editing interface and compact tools drawer to the existing city editor.

**Architecture:** A renderer-independent command service validates and commits scene patches through command history. A camera adapter and DOM panel connect it to the existing editor; authored appearance is replayed by the existing runtime.

**Tech Stack:** Existing JavaScript ES modules, Three.js r180, Node tests and Playwright.

**Spec:** docs/superpowers/specs/2026-10-18-ai-city-editor-design.md

## Global Constraints
- Preserve editor authorization, GIS geometry and normal gameplay.
- No new dependencies, AI API keys, arbitrary code execution or auto-publication.
- Release version increases from 1.6.121 to 1.6.122, rechecking main before publication.

## Review Focus
- Stale or partially invalid batches must not partially apply.
- Batched/instanced materials must not claim unsupported opacity or texture controls.
- Manual UI edits, recovery and transform gestures must remain compatible with commands.
- Named camera views must restore orbit targets and report failed persistence.
- Mobile tool panels must not obscure or disable exit/recovery controls.

### Task 1: Command service and persistence
Files: create city-explorer/editor/ai-editor-tools.js and tools/test_city_editor_ai_tools.mjs; modify authored-runtime.js.
- [x] Write behavioral tests for search, inspect, permissions, atomic batches, history, stale revisions and authored appearance; run RED.
- [x] Implement createAIEditorTools(adapter), returning run(command), with JSON-safe responses and bounded results.
- [x] Replay authored appearance through authored-runtime; run GREEN and existing editor regressions.

### Task 2: Camera and editor UI integration
Files: create ai-editor-camera.js, ai-editor-panel.js; modify city-editor.js, index.html, styles.css, app.js.
- [x] Write camera/view tests and browser workflow checks; run RED.
- [x] Connect commands to existing authorization/history/navigation and a closed-by-default Tools drawer.
- [x] Verify direct API and DOM command workflows, colour persistence, undo, view restore, and mobile layout.

### Task 3: Review, version and release
Files: documentation, shared/build-version.js, existing release normalization surfaces and CI test list.
- [x] Document commands, limitations and external browser example.
- [x] Run editor, gameplay, release and browser regressions; inspect screenshots.
- [x] Review diff, bump version once, normalize release, publish and verify deployment evidence.

Verification limit: browser checks could not execute because the managed environment has no supported control-browser plugin. Real editor lifecycle was exercised in Node with Three.js; this does not replace WebGL screenshot or physical-device QA.
