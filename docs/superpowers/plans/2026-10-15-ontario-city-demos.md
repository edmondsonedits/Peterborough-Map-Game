# Ontario city demos implementation plan and brief

Goal: Launch one shared Geo Guesser for Peterborough and 30 researched Ontario municipal demos, with clear homepage availability and aggregate demo demand in Website Stats.

Architecture: Keep the existing Geo engine, Leaflet provider, city-scoped base/dispatch stores, and Fire/EMS shared address pools. Add a compact static city data adapter. Use explicit per-mode capabilities in the lightweight registry. Keep existing six non-Peterborough free-driving previews; do not imply new cities have road-driving data. Unavailable mode links have no href and open a native accessible Request a demo dialog. Submit through existing anonymous Firestore analytics and show aggregate city/mode demand in existing Stats.

Stack: static JavaScript/HTML/CSS; Node built-in tests; Chromium browser QA. Existing research package is the data authority, not new runtime API lookups.

Global constraints: preserve Peterborough's 200 calls and saved edits, legacy city/free-driving behavior, all services sharing addresses, familiarity-based difficulty, visible optional cross streets. Future/disputed/ineligible bases stay outside selectable bases. No missing city fallback into Peterborough. Each demo has 10 Easy / 5 Medium / 5 Hard. No copied engines or gameplay code. URLs preserve city through desktop/mobile/online wrappers and subdirectory hosting. Request opens do not count; actual confirmed request does, with duplicate-submit protection and truthful network failure feedback. Existing owner/stats tracking exclusions stay in force.

Visual direction: retain current dark emergency-training homepage; slightly fade non-Peterborough game cards and add a quiet DEMO watermark without fading text below readability. Keep full Peterborough cards unchanged. Native request dialog with city/mode name, concise CTA, confirmation, keyboard close and focus return. All new city demos clearly identify selected city.

Tasks:
- [x] 1. City data and capabilities: generate small runtime data for 30 packs with provenance/status metadata; registry features geoGuesser/dispatch/route/explorer; preserve existing city manifests and old driving packages. Tests prove 30 x 20 calls, active eligible bases, coordinate guards and common service pools.
- [x] 2. Shared Geo loader: resolve explicit URL then remembered city then Peterborough; await city package, base readiness and dispatch store; error/retry for unsupported or failed load; city-aware labels/back links/wrappers; preserve editor/storage contract and initial zoom 18. Tests cover direct/wrapped launches, invalid city, delayed/failing loading, all city/base/tier combinations.
- [x] 3. Homepage: use capabilities for every mode/card/preview launch, fade DEMO labels on all non-Peterborough modes, route available demos with city, block unavailable redirects and open request dialog. Test city changes, restoration, mobile/modified clicks, unavailable click and cancel/submit.
- [x] 4. Stats: add stable deduplicated demo_request events via existing analytics transport; aggregate city/mode demand and render in Website Stats; exclude prevented launches, owner activity, duplicate clicks and failed writes from success messaging. Test transport failures/retry, aggregation deduplication and UI no-request on dialog opening.
- [ ] 5. Triple-check: data/automated tests; full regression suite and release normalization; desktop/mobile browser playthrough + request dialog/stats + real city starts; fresh branch review; publish authorized release and verify hosted assets/deployment.

Review focus: async script ordering, accidental Peterborough fallbacks, stale city/state, saved base edits and station IDs, future facilities, legacy modes, broken modified-click links, request double counts, failures falsely reported as saved, version/cache propagation, mobile Toronto base list.

Ruling: use native per-mode readiness rather than mark entire new cities playable for driving — existing road assets only cover the original preview cities. Ruling: aggregate requests in existing Website Stats, not a separate local counter — the user wants city/mode demand visible in that menu.

Ruling: Website Stats has no secure backend adapter in the repository; user confirmed Cloudflare is not set up and asked to continue. Implement explicitly labelled device request totals plus existing permitted remote events and secure aggregate contract. Global administrator counts remain dependent on that backend.
