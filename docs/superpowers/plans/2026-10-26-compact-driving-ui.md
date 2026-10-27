# Compact Driving UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the road more visible with coordinated compact driving UI transitions.
**Architecture:** One shared optional controller owns focus state and layout in the existing iframe and wrapper. Existing dispatch, vehicle controls, station selection and base data stay authoritative.
**Tech Stack:** Plain JavaScript, CSS, Node tests, existing shared build loader.
**Spec:** docs/superpowers/specs/2026-10-26-compact-driving-ui-design.md

## Global Constraints
- Preserve input targets and driving/dispatch behavior; keep one readable destination line.
- Share behavior across active city packages and Fire/EMS.
- Use no new dependencies. Honor reduced motion. Bump the canonical patch version once.

## Review Focus
- Brief stops must not re-expand the HUD.
- New call, hospital transport, arrival, completion and base changes must reveal details.
- Focused controls must not be hidden during a transition.
- Long street/address text and landscape viewports must not overlap driving controls.
- Disabled auto-minimize, unavailable storage, and late optional modules must remain usable.

## Task 1: State and presentation
- [x] Write and run failing tests for movement debounce, latched stops, attention changes, detail hold and disabled preference.
- [x] Implement response-simulator/driving-ui.js with exported createFocusState, shared DOM/CSS integration, and remembered preference.
- [x] Remove idle instructions; defer old mobile positioning once the new controller owns it; register controller in shared/build-version.js.
- [x] Run focused tests, syntax checks, and existing dispatch/base-training checks.

## Task 2: Verify and release
- [x] Review DOM layout at mobile/desktop sizes and fix integration issues.
- [x] Bump canonical patch version, normalize release, and run relevant regression checks.
- [ ] Publish via a PR merge, then verify deployment and served files.

## Verification

69 targeted Node regression checks pass. DOM integration verifies legacy HUD retirement, preference behavior, compact tools and detail reveal. Chromium QA verifies real mobile joystick movement, Fire/EMS destinations, tablet close, hospital transition, landscape clearance, desktop navigation separation and reduced motion. No page errors were observed. The review findings for legacy collapse ownership, tools overlap, focus and footer placement were addressed. Map tile appearance was not part of these local UI checks.
