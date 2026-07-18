from pathlib import Path
import re

path = Path("response-simulator/index.html")
text = path.read_text(encoding="utf-8")
original = text


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    ".leaflet-map-pane { will-change:transform,rotate; }",
    ".leaflet-map-pane { will-change:transform,rotate; backface-visibility:hidden; }",
    "map pane compositor hint",
)

replace_once(
    "        let lastTimestamp = 0;\n",
    "        let lastTimestamp = 0;\n        let visualHeading = currentHeading;\n",
    "visual heading state",
)

replace_once(
    "            mapInstance.on('move zoom resize', () => requestAnimationFrame(updateMapOrientation));",
    "            mapInstance.on('zoomend resize', () => {\n                syncCameraToTruck(true, 1 / 60);\n                updateMapOrientation();\n            });",
    "map event handling",
)

old_orientation = """        function toggleHeadingUp() {
            headingUpMode = !headingUpMode;
            const button = document.getElementById('orientation-toggle');
            button.classList.toggle('active', headingUpMode);
            button.setAttribute('aria-pressed', String(headingUpMode));
            button.innerText = headingUpMode ? 'Heading Up' : 'North Up';
            if (headingUpMode && mapInstance) mapInstance.setView([simLat, simLng], mapInstance.getZoom(), { animate: false });
            updateMapOrientation();
        }

        function updateMapOrientation() {
            if (!mapInstance) return;
            const mapPane = mapInstance.getPane('mapPane');
            if (!mapPane) return;
            const rotation = headingUpMode ? -currentHeading : 0;
            const truckPoint = mapInstance.latLngToLayerPoint([simLat, simLng]);
            mapPane.style.transformOrigin = `${truckPoint.x}px ${truckPoint.y}px`;
            mapPane.style.rotate = `${rotation}deg`;
            const needle = document.getElementById('compass-needle');
            if (needle) needle.style.transform = `rotate(${rotation}deg)`;
        }
"""

new_orientation = """        function toggleHeadingUp() {
            headingUpMode = !headingUpMode;
            const button = document.getElementById('orientation-toggle');
            button.classList.toggle('active', headingUpMode);
            button.setAttribute('aria-pressed', String(headingUpMode));
            button.innerText = headingUpMode ? 'Heading Up' : 'North Up';
            if (mapInstance) {
                mapInstance.stop();
                mapInstance.setView([simLat, simLng], mapInstance.getZoom(), { animate: false });
            }
            syncCameraToTruck(true, 1 / 60);
            updateMapOrientation();
        }

        function shortestAngleDelta(fromDegrees, toDegrees) {
            return ((toDegrees - fromDegrees + 540) % 360) - 180;
        }

        function syncCameraToTruck(force = false, dtSeconds = 1 / 60) {
            if (!mapInstance) return;
            const cameraToggle = document.getElementById('chk-camera');
            const shouldFollow = headingUpMode || (cameraToggle && cameraToggle.checked);
            if (!shouldFollow) return;

            const mapSize = mapInstance.getSize();
            if (!mapSize.x || !mapSize.y) return;

            const screenCenter = mapSize.divideBy(2);
            const truckPoint = mapInstance.latLngToContainerPoint([simLat, simLng]);
            const error = truckPoint.subtract(screenCenter);
            const errorDistance = Math.hypot(error.x, error.y);
            if (!force && errorDistance < 0.2) return;

            const safetyDistance = Math.min(mapSize.x, mapSize.y) * 0.22;
            const followFactor = (force || headingUpMode || errorDistance > safetyDistance)
                ? 1
                : 1 - Math.exp(-14 * Math.max(dtSeconds, 1 / 240));
            const correction = error.multiplyBy(followFactor);

            if (Math.abs(correction.x) >= 0.1 || Math.abs(correction.y) >= 0.1) {
                mapInstance.panBy(correction, { animate: false, noMoveStart: true });
            }
        }

        function updateMapOrientation() {
            if (!mapInstance) return;
            const mapPane = mapInstance.getPane('mapPane');
            if (!mapPane) return;

            // The viewport centre is a stable pivot. Using the moving truck point here
            // caused the previous camera drift because Leaflet was simultaneously panning.
            const viewportCenter = mapInstance.getSize().divideBy(2);
            const stablePivot = mapInstance.containerPointToLayerPoint(viewportCenter);
            const rotation = headingUpMode ? -visualHeading : 0;
            mapPane.style.transformOrigin = `${stablePivot.x}px ${stablePivot.y}px`;
            mapPane.style.rotate = `${rotation}deg`;

            const needle = document.getElementById('compass-needle');
            if (needle) needle.style.transform = `rotate(${rotation}deg)`;
        }
"""
replace_once(old_orientation, new_orientation, "orientation and camera functions")

replace_once(
    "            velocity = 0;\n            if (vehicleMarker) {",
    "            velocity = 0;\n            visualHeading = currentHeading;\n            if (vehicleMarker) {",
    "teleport visual reset",
)

loop_pattern = re.compile(
    r"        function simulationLoop\(timestamp\) \{.*?\n        \}\n\n        window\.addEventListener\(\"keydown\"",
    re.DOTALL,
)

new_loop = """        function simulationLoop(timestamp) {
            if (!lastTimestamp) lastTimestamp = timestamp;
            const elapsed = Math.min(Math.max(timestamp - lastTimestamp, 0), 50);
            const dtSeconds = elapsed / 1000;
            const frameScale = dtSeconds * 60;
            lastTimestamp = timestamp;

            const speedSetting = parseInt(document.getElementById('sld-speed').value);
            const maxSpeed = 0.0000015 * speedSetting;
            const acceleration = 0.00000005 * speedSetting;
            const frictionPerFrame = 0.96;
            const baseTurnRate = 1.2;

            // Scale all physics by elapsed time so 60 Hz, 90 Hz and 120 Hz screens
            // drive at the same speed and do not produce frame-dependent judder.
            if (keys['ArrowUp'] || keys['w']) velocity += acceleration * frameScale;
            if (keys['ArrowDown'] || keys['s']) velocity -= acceleration * 1.5 * frameScale;

            velocity *= Math.pow(frictionPerFrame, frameScale);
            velocity = Math.max(-maxSpeed, Math.min(maxSpeed, velocity));
            if (Math.abs(velocity) < 0.00000001) velocity = 0;

            let activeTurnRate = 0;
            let isTurning = false;

            if (velocity !== 0) {
                const driveDirection = velocity > 0 ? 1 : -1;
                const velocityFactor = Math.min(Math.abs(velocity) / (maxSpeed * 0.2), 1.0);
                activeTurnRate = baseTurnRate * Math.max(velocityFactor, 0.3) * driveDirection;
            } else {
                activeTurnRate = baseTurnRate * 0.7;
            }

            if (keys['ArrowLeft'] || keys['a']) { currentHeading -= activeTurnRate * frameScale; isTurning = true; }
            if (keys['ArrowRight'] || keys['d']) { currentHeading += activeTurnRate * frameScale; isTurning = true; }
            currentHeading = (currentHeading + 360) % 360;

            const rad = currentHeading * (Math.PI / 180);
            const latCorrection = Math.cos(simLat * (Math.PI / 180));
            simLat += Math.cos(rad) * velocity * frameScale;
            simLng += (Math.sin(rad) * velocity * frameScale) / latCorrection;

            const headingResponse = dtSeconds > 0 ? 1 - Math.exp(-22 * dtSeconds) : 1;
            visualHeading = (visualHeading + shortestAngleDelta(visualHeading, currentHeading) * headingResponse + 360) % 360;

            if (vehicleMarker) {
                vehicleMarker.setRotationOrigin('center center');
                vehicleMarker.setRotationAngle(visualHeading - 90);
            }

            const vehicleChanged = velocity !== 0 || isTurning || Math.abs(shortestAngleDelta(visualHeading, currentHeading)) > 0.05;
            if (vehicleChanged && vehicleMarker) {
                vehicleMarker.setLatLng([simLat, simLng]);
                syncCameraToTruck(false, dtSeconds || 1 / 60);

                if (simulationState === STATES.ENROUTE && velocity !== 0) evaluateDistanceToTarget();

                document.getElementById('tel-lat').innerText = simLat.toFixed(6);
                document.getElementById('tel-lng').innerText = simLng.toFixed(6);
                document.getElementById('tel-hdg').innerText = Math.round(currentHeading) + "Â°";
                updateMapOrientation();
            }

            requestAnimationFrame(simulationLoop);
        }

        window.addEventListener("keydown""" 

text, loop_count = loop_pattern.subn(new_loop, text, count=1)
if loop_count != 1:
    raise SystemExit(f"simulation loop: expected exactly one match, found {loop_count}")

required = [
    "function syncCameraToTruck",
    "mapInstance.panBy(correction, { animate: false, noMoveStart: true })",
    "const stablePivot = mapInstance.containerPointToLayerPoint(viewportCenter)",
    "const frameScale = dtSeconds * 60",
    "Math.pow(frictionPerFrame, frameScale)",
    "shortestAngleDelta(visualHeading, currentHeading)",
]
for token in required:
    if token not in text:
        raise SystemExit(f"missing required token: {token}")

for forbidden in [
    "mapInstance.on('move zoom resize'",
    "const truckPoint = mapInstance.latLngToLayerPoint([simLat, simLng]);",
    "mapInstance.setView([simLat, simLng], mapInstance.getZoom(), { animate: false });\n                }\n\n                if (simulationState",
]:
    if forbidden in text:
        raise SystemExit(f"obsolete camera code remains: {forbidden}")

if text == original:
    raise SystemExit("camera patch made no changes")

path.write_text(text, encoding="utf-8")
print("Simulator camera follow and frame timing patched successfully.")
