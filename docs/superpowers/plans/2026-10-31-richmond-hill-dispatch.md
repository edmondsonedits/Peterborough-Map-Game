# Richmond Hill Dispatch demo parity

Reuse the shared Peterborough runtime with Richmond Hill canonical data. Preserve its smaller existing call catalogue.

| System | Implementation/check |
|---|---|
| Map/bounds/basemap | Existing Richmond Hill map and tile options |
| Fire/EMS vehicles and bases | Six active fire stations and two EMS bases; exclude planned station |
| Input/speed/gears/braking | Existing desktop keys, phone thumbstick and pedals |
| Camera | North-up default, Driving View mapping, drag/pause hint and Recenter |
| Road movement | Actual Richmond Hill compressed road network; station exit and arrival snapping |
| Calls/filters | Existing local response pools and shared city calls; no invented addresses |
| Dispatch workflow | Dispatch audio, timer, response, arrival, completion, next call/reset |
| EMS transport | Existing canonical hospital site record; pickup, transport, handover |
| Route learning | City-aware route answers, drive trace and comparison for both legs |
| Persistence/readiness | City-scoped stores, startup errors, service/base changes, history |

Hospital destination provenance: use richmond-hill-call-10 from existing geo-data.json. Its site point is a training destination, not a verified ambulance entrance. Preserve original coordinates and sources. No operational routing suitability claims.

Plan: add failing city-parity tests; enable the package/capabilities; remove only Richmond Hill route stubs; make shared routing use selected city roads; test Fire and EMS complete cycles plus routes/camera/controls in browser; run related regression suites. Work isolated from concurrent changes.
