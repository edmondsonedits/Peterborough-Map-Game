# Near-wall visibility correction — November 10, 2026

The actual v1.6.203 Lite cab capture `generic-commercial-cab` shows floating dark roof shapes where nearby walls should be visible. This also appears in its unchanged baseline; it is a pre-existing rendering defect, not a regression introduced by the route materials.

The saved receipt for GitHub run `42844958589` gives camera position `[-107.30366215099876, 3.097316663988466, -56.84715773365379]`. The current source centroid of `way/1005415935` (166 McDonnel Street) is about 17.00 m away. Its 1,800 m render cell is `(4,4)` with centre `(785.1243327274324,-809.9859999996897)`, 1,167.75 m from the camera. Lite's wall radius is 1,050 m. The old code measured to the cell centre, hid the whole wall batch and retained the roof under its much larger radius.

The v205 fix measures the shortest horizontal distance to the render cell's bounds. A camera inside the cell now has distance zero. Distant cells still obey the existing quality-profile radii. Street-level visibility is reconsidered per 120 m camera cell rather than waiting for a 600 m movement cell; overview mode retains its larger cache interval. No source geometry, material, road surface, physics or saved quality preference changes.

Two tests execute the actual app visibility code. They first failed on the captured camera position and on an approach across the old cache interval, then passed with the correction. Existing authored replacement/map-return visibility checks and graphics-profile tests also pass (8/8). Fresh matched cab images and draw/triangle metrics at the McDonnel control are required to verify the visual and performance consequences before quality approval.
