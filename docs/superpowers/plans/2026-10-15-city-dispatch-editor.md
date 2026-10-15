# City Dispatch Editor implementation plan

Goal: Every published call is available in the Dispatch Editor, clearly scoped to its city and difficulty, using the exact same address pool and saved edits as Geo Guesser.

Design: Reuse the existing editor with one city at a time, selected by URL/dropdown. No all-cities marker/list mashup. Load only the selected city's data through one shared location runtime used by Geo and editor. Peterborough retains200calls,30 demos retain20each, and existing Belleville/Scarborough empty catalogs remain explicit. The runtime must not silently fall back for an explicit invalid city. City switching navigates to an explicit city URL after a dirty-edit safeguard, destroying old markers/globals/late loads. Saves, searches, filters and delta exports stay city-scoped. Exports include city ID/name and city-specific filenames. Difficulty remains familiarity-based; Fire/EMS share addresses.

Tech: static JS/HTML/CSS, existing Leaflet/store/editing modules, Node tests and Chromium QA. No new runtime service or library.

Interfaces:
- shared/city-location-runtime.js: window.PTBO_CITY_LOCATION_RUNTIME.load({context:'geo'|'editor'}) -> Promise<cityPackage>; selected city resolves URL then valid rememberedcity thenPeterborough. Creates PTBO_CITY_PACKAGE, PTBO_SERVICE_CONFIG, PTBO_BASE_STORE, PTBO_DISPATCH_STORE and awaits their readiness. Immutable/static seed data version for newcitycatalog remains ontario-geo-1.
- geo-guesser/city-loader.js: tiny compatibility bootstrap publishing PTBO_GEO_CITY_READY from shared runtime.
- dispatch-editor/city-loader.js: PTBO_EDITOR_CITY_READY + PTBO_EDITOR_READY. Publishes PTBO_EDITOR_CAPABILITIES={bases:boolean,hospital:boolean}; loads conditional legacy helpers only after city/store data, then editor.js. Editor calls are always editable when loaded. Base areas require verified road data; others remain available for reference with no misleading base-save action. Hospital tab disabled where no configured supported destination exists.
- dispatch-editor/editor.js: reads resolved globals afterbootstrap; labels currentcity, creates all33 cityoptions with availablecatalogcounts, difficulty filter/group labels + separate crossstreetdisplay. Exports calls diff against same seed, includes cityId/cityName; hospital arrays empty if absent. PTBO_EDITOR_TEST API not introduced; tests use actualDOM/browser as needed.

Tasks:
- [x] 1. Shared loader extraction and editor bootstrap. Tests: all31 Geo catalogs identicallyavailable ineditor (800total), legacyemptycities, invalidURL, delayed/failing load, singlecityassetfetch andsavededitpersistence.
- [x] 2. City editor UI, tierorganization/search, safe cityswitch/dirtyformguard, nullhospital/unsupportedbasehandling, city-specificdeltaexport. Tests: only selectedcityrows/markers;200vs20counts,10/5/5filters; savedmetadata; cancel/confirmcityswitch; matchingcityfile/export; readonlybase/capabilityguard; emptycitystate.
- [ ] 3. Homepage/settingseditorlinks selectcurrentcity directly; registry/editorcapability no longerproxybydrivingavailability. Regressiontests,all33editorbrowserboots, mobile/desktopviews, crosscitysaveisolationandGeoeditroundtrip,review,publishv1.6.110 andverifyhostedassets.

Global constraints: preserve allpublished IDs/seeddata andpreviousedits; do not copy addresses into a second catalog; preservePeterboroughfullbase/hospitaltools andaccesscheck; no remote publishingfromeditor; no fakecrosscityrouting; HTMLescapedcity/place text; no newcityroadsassumption; no futurebasebecomesactive. Savedcalls use existing citynamespaceandontario-geo-1 version.

Review focus: asyncscriptordering/earlycapturedstores; nullhospitaldiff; editorGeo savededitidentity/seeddrift; cityswitchduringunsavedformorplacement; quickfiltermarkerselection consistency; savedcallspollutingothercity; readonlybaseUI promises; obsoletehelperinjection; blockedstorage/fetch; exports mislabeledPeterborough; mobilelistcrowdedbynewcontrols.

Review: fixed short laptop sidebar collapse and saved-only hospital exports. All 407 Node tests, focused editor browser checks, and all 33 production-page city boots passed before publication.
