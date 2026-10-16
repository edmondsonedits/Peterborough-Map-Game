# City training and continuous driving

Authorized scope: Geo Guesser Next and Try Again, speed-dependent driving camera stalls, EMS nursing-home priority in existing training modes, Route Mapping for all 33 listed cities. Publication authorization continues from the preceding release request.

Acceptance:
- Geo permits an intentional Next/skip before or after an attempt, while Try Again retains the missed target; skips do not count as completed answers. Keyboard and phone controls remain usable.
- Reproduce the camera transition, diagnose its active owners, measure comparable before/after frame timing, and preserve useful speed zoom and driving behavior.
- Use Ontario's published long-term-care records, retain source identity/coordinates, and favor those records for EMS without fabricating locations or changing Fire selection. Keep service priority independent of map tiles.
- Route Mapping loads only the selected city's independently sourced road network and bases, preserves directed streets, scopes progression by city, and completes Fire and EMS routes in every listed city. Loading failures have usable retry feedback.
- Inspect desktop and narrow-phone journeys, missing requests/console errors, and relevant behavioral regressions; obtain independent review before release.

Work ownership: Luna High owns Geo skip/retry UI/session changes. GPT-6.1 Sol High owns dispatch camera diagnosis and implementation. Lead owns city data/runtime, shared EMS policy and integration. A Sol Medium deep reviewer independently checks consequential integrated changes. Writers preserve concurrent edits; commits/publication remain with lead.

Data: retain Peterborough production roads and canonical catalog. Build additional bounded road extracts from the existing Geofabrik Ontario PBF (2026-09-27 snapshot), preserving OSM identifiers, direction/access tags and attribution. Long-term-care records come from Ontario MOHSERLO, with community/bounds checks and stable provider IDs. No runtime dependency on the source APIs. New road/data files remain separate from visual tiles. Preview dispatch availability stays honest; this request does not establish missing hospital transport workflows.

Sequence: focused failing regressions and baseline; independent Geo/camera work while lead validates data and city adapter; shared EMS integration; each-city route checks; integrated independent review; version/cache normalization, regression suite, browser acceptance; authorized commit/push/deploy and fresh live checks.
