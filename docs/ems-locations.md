# EMS locations and gameplay — v1.6.0

Research checked September 3, 2026. This release adds Peterborough County-City
Paramedics' **two City of Peterborough bases** to the existing city road map.

| Playable base | Address | Evidence |
| --- | --- | --- |
| Armour Road Headquarters | 310 Armour Road, Peterborough | [County emergency plan](https://www.ptbocounty.ca/media/ngsmwmb5/county-emergency-plan-without-appendix.pdf); [Ontario Health atHome directory](https://www.centraleasthealthline.ca/displayservice.aspx?id=51157) |
| Clonsilla Avenue Base | 1003 Clonsilla Avenue, Peterborough | [City council West End Ambulance Base report](https://pub-peterborough.escribemeetings.com/filestream.ashx?DocumentId=12061); [contemporary lease report](https://themillbrooktimes.ca/ptbo-county-city-paramedics-establish-west-end-base/); [County's current base listing](https://www.ptbocounty.ca/county-government/departments/paramedics/service-commitment/) |

The County's current [service commitment](https://www.ptbocounty.ca/county-government/departments/paramedics/service-commitment/)
also lists **Lakefield, Norwood, Apsley, Millbrook, and seasonal Buckhorn
(April–October)**. These five county bases are outside this game's current city
road network and are not selectable spawns. Apsley's base is listed at **183
Burleigh Street**, North Kawartha Medical Centre, by the [Township](https://www.northkawartha.ca/living-here/emergency-services/ambulance-and-paramedics/).
Do not infer the other county bases' street addresses from administrative mailing
addresses. In particular, 470 Water Street is the County office, not the Armour
Road ambulance spawn. Ornge is a separate operator, not a PCCP city base.

## Coordinates and hospital access

Both city addresses were independently geocoded with the Esri World Geocoding
Service (`findAddressCandidates`, September 3, 2026; `PointAddress`, score 100):

| Location | Latitude | Longitude |
| --- | --- | --- |
| 310 Armour Road | 44.3047473 | -78.3034836 |
| 1003 Clonsilla Avenue | 44.2892770 | -78.3459780 |

These are mapped address positions, not surveyed garage door coordinates. The
existing station-exit system connects them to the nearest drivable road. Tests
verify that each has an exit within the system's 120 m limit.

EMS transports end at **Peterborough Regional Health Centre, 1 Hospital Drive**,
confirmed by [PRHC](https://www.prhc.on.ca/about-us/directions-maps/).
The game marks a **Hospital Drive arrival point** at `44.3009500, -78.3460594`,
on the shipped OpenStreetMap road geometry (way 250811912). Its 30 m arrival
radius is reachable with road boundaries enabled. This is a game arrival zone
at the hospital, not a claim about the exact ambulance-bay entrance. The
hospital building centroid is deliberately not used as an unreachable target.

## Gameplay contract

- The satellite map loads, then a Fire / EMS modal opens on each simulator visit.
- Options can change service or base; doing either cancels the current assignment.
- Fire retains its three stations and scene-only completion.
- EMS uses the ambulance and city bases. Both existing alarm categories are
  deselected by default; players can adjust any call filter. Each service retains
  its own filter choices during the session.
- EMS follows response → scene pickup → hospital transport → handover → available.
  Pickup and handover each take four seconds. This is the requested game rule;
  it is not a model of actual clinical transport decisions or treatment times.
- Only completed assignments increment the call count. Response and transport
  times are displayed separately. Route reveal supports the active leg; the final
  comparison preserves both the response and hospital legs.
- Cancelling increments an assignment generation and clears its timers so a late
  callback cannot finish a different call.


## v1.6.2 editor and route update

The Call & Base Editor has Calls, Bases and Hospital tabs. All existing Fire/EMS
bases can be edited; additional bases receive stable IDs and service-specific
numbers. Base centre coordinates are also the spawn point. A square side length
(10–400 metres) and rotation (0–359 degrees) define a permanent drivable area,
including return trips. Initial squares are 160 metres per side, gameplay areas
rather than surveyed property boundaries. The editor requires the square to
intersect the shipped road centreline network before saving.

The hospital tab edits the drop-off name, address, coordinates and arrival radius.
Its arrival circle must reach a mapped road. Hospital settings are captured at
dispatch, so editing the destination during a call cannot move that call's target.

Save on This Device persists edits locally for simulator testing. Export Changes
is also available on mobile. The JSON format `ptbo-location-changes`, schema 1,
contains separate `calls`, `bases` and `hospital` deltas against published data.
Each delta contains `added` records, `updated` entries with stable `id`, `before`
and field-only `changes`, and `deleted` IDs. Unchanged records are omitted.
Exporting does not publish changes or clear them; send the file back for review
and application to the source files. A source version is included. Existing
call changes saved on the device are included, not just edits since page load.

Base source values remain in `response-simulator/service-config.js` (optional
`yardSize` / `yardRotation` override the defaults). `shared/base-locations.js`
serves the editor and simulator, using `shared/location-changes.js` for deltas.
Apply an exported patch by checking `before` values against current source, then
changing only the supplied fields; never replace a database with the delta.
The hospital record is in the same service configuration. Call records live in
the compressed payload in `shared/dispatch-data-1.4.4.js`.

EMS completion comparison now preserves both legs: blue for the player's drive
to the call, green for its recommended route, orange for the player's hospital
drive, and purple for its recommended route. Each route has its own hide/show
control. Each leg reports its own elapsed time and distances. Fire retains two
route colours. Recommended routes still come from the existing road graph.
