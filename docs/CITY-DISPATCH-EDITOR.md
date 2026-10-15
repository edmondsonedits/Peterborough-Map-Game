# City Dispatch Editor

Released with v1.6.110.

The Dispatch Editor opens the city selected on the main menu or in Geo Guesser. Its city selector contains all 33 registered cities. The published address catalog contains 800 calls: Peterborough's 200 (100 Easy, 50 Medium, 50 Hard), plus 20 in each of the 30 Ontario demo cities (10 Easy, 5 Medium, 5 Hard). Belleville and Scarborough retain their explicit empty catalogs; they do not display another city's addresses.

Only the selected city's records and map markers are loaded. Calls are grouped by difficulty and labeled with the city, familiarity tier, review status and shared Fire/EMS use. Search covers names, addresses and cross streets. Filters affect both the list and markers. Cross streets remain separate from the address. Peterborough's scenario fields remain available for its other game modes; demo addresses do not acquire invented scenario or district metadata.

Geo Guesser and the editor share `shared/city-location-runtime.js`, the canonical city data, dispatch IDs, data version and existing city-scoped local storage. Saving an address affects that city's games on the same device. Changing cities reloads an explicit city URL and warns before discarding an unfinished edit or new placement. Saved edits remain in their own city. An invalid explicit city reports an error instead of silently opening Peterborough.

Exports use `<city-id>-location-changes.json`, include city ID/name, and contain saved changes against that city's published seed. Unsaved form drafts and staged hospital geometry are excluded. The editor still saves locally and cannot publish to the live website. Empty or unsupported hospital catalogs export an empty delta. Bases without verified road editing data are read-only references; Peterborough retains its base and hospital area tools.

## Verification

- `node --test tests/*.test.cjs tests/*.test.mjs`
- `PTBO_CHROMIUM_EXECUTABLE=<chromium> node tests/editor-city-ui-browser.cjs`
- `PTBO_CHROMIUM_PATH=<chromium> node tools/check-city-dispatch-editor.cjs`

The full production-page browser check boots all 33 editors, counts all 800 records, checks tier counts and markers, verifies empty initial exports, tests city isolation and an editor-to-Geo round trip, and checks multiple desktop/mobile sizes. Browser QA intercepts external analytics writes and uses explicitly labeled local tile fixtures. The hosted release is checked separately with real map tiles. Focused UI checks cover unsaved changes, cancel/confirm city switches, new drafts, exports, and short laptop/landscape layouts.

Release verification: 407 Node tests passed, both browser checks passed, all 33 editors accounted for 800 published calls, and independent review found no remaining Important issues.
