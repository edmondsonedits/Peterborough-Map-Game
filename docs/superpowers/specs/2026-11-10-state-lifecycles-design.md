# State lifecycle audit and hardening

Intent: make Peterborough Map Game's existing workflows understandable to players,
developers, and coding agents without changing its training rules or appearance.
Audit baseline: `094b465931dd7174b8cf75621b28637e3f33f7c0`, v1.6.201.

## Decision

Use the existing domain controllers. Document their states, transition owners,
guards, asynchronous ownership, and test locations. Fix reproduced lifecycle
defects with focused changes and behavioral regression tests. Do not add a
state-machine dependency or migrate the whole application in one release.

Alternatives considered: documentation alone leaves reproduced user-visible
failures; a global state store/framework would cross iframe, editor, server and
game boundaries and increase migration risk. Small domain-owned transitions are
the chosen approach under the user's request to make the implementation decision.

## Scope

- Inventory first-party live workflows across launch/shared loading, training
  modes, 3D runtime, multiplayer, editors/publishing, feedback/accounts, analytics,
  and the separate Tunnel Break route. Distinguish explicit state from
  implicit combinations and historical entry points from live ones.
- Make multiplayer transport/runtime initialization single-flight. Leaving or
  disposing invalidates pending initialization, prefetch, join and activation.
  A failed initialization can retry. Old callbacks cannot replace a newer session.
- Preserve newly typed developer-note text while an earlier note saves; retain
  the submission identity for retries. Use the owning textarea/draft identity,
  not a global lookup after awaiting.
- Apply the same ownership guard to failed account-token refreshes and stale
  developer-control errors. Roll back failed status edits to the latest subscribed
  document. These additional defects were reproduced during the audit.
- Restart exactly one driving-HUD timer after a cached page is restored, retaining
  focus/compact state; stop it again on each pagehide.
- Provide a human-readable inventory and a machine-readable companion with
  source anchors, states, events, invariants, existing inspection APIs and tests.
- Increment the app once to v1.6.202 and normalize release references using the
  existing release script. Preserve multiplayer world hashes/protocol.

## Verification and limits

Use deterministic deferred promises to exercise adverse event ordering, real
DOM integration for note editing, existing regression suites and browser smoke
tests when available. Record actual baseline and final results. Source inspection
does not prove exhaustive reachability; inventory counts describe the reviewed
workflow boundaries, not a mathematical proof that every possible state is known.
Do not describe a branch, passing unit test, or deployment request as a verified
production release.
