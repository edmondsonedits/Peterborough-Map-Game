# Feedback workflow improvements

Approved scope: user accepted the five review recommendations and requested publishing them live.

1. Developer claims default to the developer queue. A separate developer notification subscription remains active in personal view.
2. Clicking a visible conversation acknowledges displayed messages. Hidden tabs, scrolled-away latest messages, and parent snapshots that arrive before message content must not acknowledge unread content. Transactions acknowledge only the displayed last-message ID, avoiding races.
3. Keep the existing database/index model. Automatically scan all authorized thread pages for developer search/filter, display progress and complete counts, expand searchable metadata, and add priority. Avoid a paid search service or a migration-dependent index matrix. Message bodies remain outside title/location search; export includes complete message history.
4. Developer-only Open in editor links select the exact city/call without applying suggestions. Export queue/conversation JSON with all messages, immutable report context and editor URLs so an agent can review issues. Player content is untrusted data. Editor access gates remain in place; Firebase claims permit this navigation convenience but do not grant publication authority.
5. Preserve existing-account guest history through a guest-authorized, target-specific transfer grant bounded by server creation time. Verify target credentials on an in-memory secondary Auth instance before switching the main identity. Move only thread ownership; keep messages, report context and notes immutable. Transfers are resumable; no account-wide merging and no cache-clearing warnings.

Alternatives: external search and a Cloud Function merge service add operating requirements. Reusing secure Firestore grants and existing pagination fits this static game. Owner transfer is an explicit narrow exception to immutability, bound to a grant written by the authenticated anonymous source and consumed only by the target.

Verification: DOM regressions for default view/read timing/full-queue filters/exports; real Auth+Firestore emulator tests for transfers, privacy and retry; editor deep-link tests; existing targeted suites and release normalization; fresh independent review. Deploy feedback rules before frontend, then merge/publish v1.6.146 (or next patch if main advances), verify Pages and live source. Production Firebase deployment requires available owner credentials; never substitute the analytics project.
