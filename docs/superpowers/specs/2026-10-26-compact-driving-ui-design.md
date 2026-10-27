# Compact driving interface

Danny approved the compact layout proposed in chat, with a simple smooth animation when movement starts. Keep the destination readable as one line. Apply shared Fire/EMS and city behavior on mobile and desktop.

Remove standby instruction copy, hide the idle timer, combine current street and speed, compact the map toggle to an edge icon, tuck navigation tools behind one button during driving, soften the control backgrounds without moving or shrinking the driving touch areas, and move the build label into Options. Retain live dispatch, transport, arrival, and completion information.

Use a shared optional UI controller on the existing simulator, rather than independent per-city layouts. Collapse after sustained movement above 5 km/h; latch through brief stops. Expand on dispatch phase/base changes and for eight seconds after tapping the destination. A remembered Auto-minimize UI setting disables automatic collapse. Transitions take about 550 ms with restrained easing; reduced-motion preferences disable them. Reuse existing gameplay actions and data.
