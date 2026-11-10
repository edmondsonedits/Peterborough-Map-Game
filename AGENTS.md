# Peterborough Map Game: changing lifecycle behavior

Use [the state inventory](docs/architecture/state-machines.md) to find the owner
of a workflow before changing it. Its [JSON companion](docs/architecture/state-machines.json)
lists source anchors, states, events, invariants, inspection APIs and related tests.
The inventory is documentation, not another runtime state store or a proof of
complete transition coverage.

- Trace the live HTML entry point and its imports. A versioned filename can still
  be active; some historical entry points are compatibility forwarders.
- Keep independent workflows separate. Station/fleet selection, missions, aerial
  control, room membership, UI presentation and editor drafts have different owners.
- At each asynchronous boundary, recheck the owning document, account/draft or
  request generation before committing success **or failure**. Leave/dispose must
  retire pending work. Shared initialization should have one in-flight owner.
- Preserve existing public APIs and persistence identities. A retry of the same
  submission keeps its ID; edited text belongs to a new draft.
- Test adverse ordering with deferred promises and real DOM handlers where useful.
  Cover failure/retry, cancellation, stale success/rejection and cached-page restore.
- Use existing inspection APIs listed in the inventory. Never expose account,
  player, reconnect or admin credentials through new diagnostics.
- If a workflow changes, update its inventory entry and source anchors. For a new
  stateful feature, add an entry rather than creating an untracked second owner.

## Release and checks

Increment `shared/build-version.js` by one patch version per application update,
then run `node scripts/normalize-release.cjs`. This refreshes active entry points
and shared module cache identities, including the feedback service.

Run `node tools/check-state-inventory.mjs` and relevant tests from each entry.
For broad lifecycle changes use:

```sh
node --test tests/*.test.cjs tests/*.test.mjs
node --test tools/test_city_editor_*.mjs
```

The test dependencies are installed with `npm ci --prefix tools/location-report-tests
--ignore-scripts --no-audit` and `npm ci --prefix city-explorer/multiplayer/server
--ignore-scripts --no-audit` (each command on one line).

Preserve the multiplayer world's canonical source pins in the release normalizer.
Run `node tools/export-multiplayer-world.mjs` and inspect any world-data diff before
publishing. An unchanged world must retain its existing server-compatible hash.
Report the new version, review/play link, tests and actual publication status.
