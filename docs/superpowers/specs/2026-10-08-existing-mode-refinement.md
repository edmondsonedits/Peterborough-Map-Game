# Existing-mode refinement design

User authorization: audit the full existing repository, record notes first, then implement necessary refinements autonomously. This is maintenance of established flows and interfaces; no new games or cross-project subsystems.

Use the current static HTML/Leaflet/Three.js architecture. Work from current GitHub main in isolation. Keep published data, legal notices, training outcomes and saved schemas intact. All behavior changes must address the evidence in docs/audits/2026-10-08-repository-quality.md.

Input cancellation releases ownership and never commits an interrupted action. Dialogs own keyboard, pointer and controller input. Optional preferences cannot block gameplay. Multi-key hospital saves either commit both records or retain the previous runtime state and a recoverable draft. Directed path caching is scoped to graph identity and bounded to 256 entries. Geometry bounds validate finite points without spreading arbitrarily sized arrays. Async resources use controller identity; stale callbacks cannot dispose a replacement. Off-road speed decays gradually with existing service-brake bounds.

Visual direction: keep the existing dark panels, improve Geo Guesser hierarchy/focus/touch/readability, use native modal focus behavior and prevent notices covering existing controls. Avoid changing geographic geometry to improve appearance.

Acceptance: normalized existing suites plus meaningful new regressions pass; every mode receives a Chromium gameplay check; existing 3D authored/mobile/station checks are exercised; compile and diff checks pass. Document provider/backend/physical-device limitations truthfully. No push, merge or deployment in this request.
