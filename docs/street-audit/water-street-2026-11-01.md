# Water Street paint correction — King to Charlotte

The previous general stripe update did not reconstruct this block's actual road-space layout. This correction targets Water Street near Showplace/MNR, between mapped King Street node 389006282 and Charlotte Street node 388959369, on way 33966726. It does not apply the same profile to every street named Water.

## Evidence and diagnosis

The packaged OSM way describes two northbound travel lanes and a right-side bicycle lane, but has no measured width or buffer allocation. Its inferred 7.15 m width placed a dashed white divider on the OSM axis and only one cycle separator 2.055 m east of it. Municipal road surface 11/5738 is about 12.4–13.6 m wide across the reviewed core. Its curve also departs laterally from the sparse 92.6 m OSM chord.

A geolocated [Ontario aerial export](https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_Imagery/Ontario_Imagery_Web_Map_Service/MapServer) covering the exact King–Charlotte block was visually inspected, with an overlay of the old map axis and proposed paint. The mosaic export does not establish an acquisition date. It shows roadside parking and close parallel white lines east of the travel area. The [City's 2023 street-design guidance](https://www.peterborough.ca/media/mivbkdnp/ipspl23-007-appendix-a-central-area-urban-design-guidelines-accessible-2023-04-19-copy.pdf), PDF page 91, illustrates Water Street parking, travel lanes, bicycle lane and buffer; it is contextual guidance, not a measured as-built cross-section. Offsets below are calibrated visual estimates, not survey dimensions.

## Scoped paint layout

The validated core spans latitude 44.30220–44.30332. The municipal polygon supplies 66 cross-section samples at roughly 2 m spacing, all accepted. Paint follows the eastern curb rather than the straight OSM chord. From that curb, white lines at 2.2 m, 3.0 m and 4.5 m reserve curbside parking, a buffer and a bicycle lane; the same-direction broken white lane divider sits at 7.7 m, with the existing 3 m / 6 m pattern. Normal stripe width remains 0.10 m. No hatch cadence or stop-bar placement is inferred from blurred pixels.

Short estimated endpoint-tangent approaches connect the validated curb frame to the existing junction-cut limits. They are capped at 20 m per end, recorded separately, and preserve the source way distances and editor identity. Generic paint is removed across the King–Charlotte span only after complete replacement coverage is established. Invalid geometry leaves the generic paint intact. Road-contact surfaces and geographic footprints are not modified.

## Acceptance gates

Source tests cover selection, width rejection, curve continuity, invalid-core fallback, bounded approach extension, source-distance phase, junction gaps and suppression coverage. Before projection, all reviewed stripes are sampled along their centre and both edges at no more than 1 m intervals against the final pavement index. Unsupported points stop the offline build. The pack verifier requires the accepted core and complete coverage. Final verification includes the map-wide paint-support check, unchanged road-contact hashes, and matched phone chase-camera views at Showplace and both block ends. Local photos, overlays and receipts remain in artifacts/water-street and are excluded from the hosted game.

## Accepted release evidence

Release v1.6.162, pack `1c34456c61d050e27148`: 669 tiles, 4,349,747 total triangles, 74,689,607 compressed bytes. All 48 source fingerprints match the staged source. The compiled renderer accepted 69 core samples with zero rejects; approach extensions after real junction cuts are 6.150 m and 11.159 m. All 2,523 centre/edge support probes across solid and dashed paths passed.

Whole-map paint verification checks 1,207,918 non-tiny triangles, with zero missing, below-surface or above-surface failures. All 669 road-contact hashes and 2,579,249 contact triangles match baseline `f9d0d930c65fac571783`. Full tests: 1,261 passed, zero failed/skipped.

The final phone-emulation report passes every assertion. Balanced captures Showplace and both bend/approach positions; Low/High capture Showplace. Root visually inspected the matched Balanced views against the baseline and accepted the new lateral placement, curved parallel lines and junction cut stops. Phone captures are under artifacts/water-street/after-phone/before; the inner label is the single-URL harness default, while the containing report and expected pack ID identify the accepted after-build. No page, first-party request or tile failures. Browser phone emulation is not physical-device performance evidence.
