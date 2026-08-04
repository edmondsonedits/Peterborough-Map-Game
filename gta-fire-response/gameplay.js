function refreshTruckMarker() {
  if (!truckMarker) return;
  truckMarker.setLatLng([truck.lat, truck.lng]).setIcon(truckIcon());
}
function showToast(text, milliseconds = 2600) {
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => ui.toast.classList.remove('show'), milliseconds);
}
function setPrompt(text, action, key = 'E') {
  promptAction = action;
  ui.promptText.textContent = text;
  ui.promptKey.textContent = key;
  ui.action.textContent = text.length > 15 ? 'Action' : 'Interact';
  ui.prompt.classList.remove('hidden');
}
function clearPrompt() {
  promptAction = null;
  ui.prompt.classList.add('hidden');
  ui.action.textContent = 'Interact';
}
function updateMission(kicker, title, address, objective) {
  ui.kicker.textContent = kicker;
  ui.title.textContent = title;
  ui.address.textContent = address;
  ui.objective.textContent = objective;
}

function startShift() {
  if (roads.status === 'failed') {
    initRoads();
    return;
  }
  if (roads.status !== 'ready') return;
  ui.start.classList.add('hidden');
  startedAt = performance.now();
  mission = 'available';
  updateMission('STATION 1 · AVAILABLE', 'Engine 1 ready for service', STATION.address, 'Walk to the engine and enter it.');
  showToast('SHIFT STARTED · ENGINE 1 AVAILABLE');
  setTimeout(() => { if (mission === 'available') dispatchCall(); }, 3800);
}
function dispatchCall() {
  let next;
  do { next = CALLS[Math.floor(Math.random() * CALLS.length)]; }
  while (activeCall && next.address === activeCall.address);
  activeCall = next;
  mission = 'dispatched';
  taskProgress = 0;
  callStartedAt = performance.now();
  updateMission(`${next.label} · DISPATCHED`, next.title, next.address, 'Enter the engine and respond to the call.');
  showToast(`DISPATCH: ${next.title.toUpperCase()} · ${next.address.toUpperCase()}`, 4300);
  if (incidentMarker) incidentMarker.remove();
  incidentMarker = L.marker([next.lat, next.lng], { zIndexOffset: 900, interactive: false, icon: incidentIcon(next) }).addTo(map);
  if (routeLine) routeLine.remove();
  routeLine = L.polyline([[truck.lat, truck.lng], [next.lat, next.lng]], { color: '#f4d03f', weight: 4, opacity: .72, dashArray: '8 10', interactive: false }).addTo(map);
  refreshTruckMarker();
}
function enterTruck() {
  mode = 'truck';
  playerMarker.setOpacity(0);
  truck.speed = 0;
  mission = activeCall ? 'enroute' : 'available';
  ui.joystickLabel.textContent = 'Point to drive';
  showToast('ENGINE 1 · POINT THE STICK WHERE YOU WANT TO DRIVE');
  updateMission(activeCall ? `${activeCall.label} · EN ROUTE` : 'STATION 1 · MOBILE', activeCall ? activeCall.title : 'Engine 1 mobile', activeCall ? activeCall.address : STATION.address, activeCall ? 'Point the thumbstick toward the incident.' : 'Await dispatch.');
  map.setZoom(18.25, { animate: true });
  beginStationExit();
  refreshTruckMarker();
}
function exitTruck() {
  mode = 'foot';
  truck.speed = 0;
  const exitPoint = pointFrom(truck, normalizeHeading(truck.heading + 90), 5);
  player.lat = exitPoint.lat;
  player.lng = exitPoint.lng;
  player.heading = truck.heading;
  playerMarker.setLatLng([player.lat, player.lng]).setOpacity(1);
  ui.joystickLabel.textContent = 'Run';
  showToast('ENGINE 1 · PARKED');
  map.setZoom(19, { animate: true });
  if (activeCall && meters(player, activeCall) < 85) {
    mission = 'onscene';
    updateMission(`${activeCall.label} · ON SCENE`, activeCall.title, activeCall.address, activeCall.task);
  }
  refreshTruckMarker();
}
function completeCall() {
  mission = 'complete';
  actionHeld = false;
  score += Math.max(250, 1200 - Math.floor((performance.now() - callStartedAt) / 1000) * 8);
  ui.score.textContent = String(score).padStart(4, '0');
  if (routeLine) { routeLine.remove(); routeLine = null; }
  if (hoseLine) { hoseLine.remove(); hoseLine = null; }
  const elapsed = performance.now() - callStartedAt;
  const rank = elapsed < 90000 ? 'A' : elapsed < 150000 ? 'B' : 'C';
  ui.endTitle.textContent = `${activeCall.title} Cleared`;
  ui.endCopy.textContent = activeCall.type === 'fire'
    ? 'The fire has been knocked down and overhaul is underway.'
    : activeCall.type === 'medical'
      ? 'The patient has been assessed and transferred to paramedics.'
      : 'The vehicle is stabilized and all occupants have been checked.';
  ui.endTime.textContent = formatTime(elapsed);
  ui.endScore.textContent = String(score).padStart(4, '0');
  ui.endRank.textContent = rank;
  ui.end.classList.add('show');
}
function returnStation() {
  ui.end.classList.remove('show');
  if (incidentMarker) { incidentMarker.remove(); incidentMarker = null; }
  activeCall = null;
  taskProgress = 0;
  ui.progress.style.width = '0';
  mode = 'foot';
  mission = 'available';
  player = { lat: STATION.lat - .00016, lng: STATION.lng - .00008, heading: 0, speed: 0 };
  truck = { lat: STATION.lat + .00003, lng: STATION.lng + .00010, heading: 165, speed: 0 };
  roads.stationExit = null;
  playerMarker.setLatLng([player.lat, player.lng]).setOpacity(1);
  refreshTruckMarker();
  beginStationExit();
  map.setView([STATION.lat, STATION.lng], 19, { animate: true });
  ui.joystickLabel.textContent = 'Run';
  updateMission('STATION 1 · AVAILABLE', 'Engine 1 ready for service', STATION.address, 'Walk to the engine and enter it.');
  showToast('RETURNED TO QUARTERS');
  setTimeout(dispatchCall, 3000);
}
function interact(held = false) {
  if (!promptAction) return;
  if (promptAction === 'enter' && !held) enterTruck();
  else if (promptAction === 'exit' && !held) exitTruck();
  else if (promptAction === 'work') actionHeld = held;
}

function updateFoot(dt) {
  let x = analog.x + (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  let y = analog.y + (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  const magnitude = Math.hypot(x, y);
  if (magnitude > .08) {
    x /= Math.max(1, magnitude);
    y /= Math.max(1, magnitude);
    player.heading = Math.atan2(x, -y) * 180 / Math.PI;
    movePoint(player, player.heading, 5.3 * dt);
    playerMarker.setLatLng([player.lat, player.lng]);
    const element = playerMarker.getElement()?.querySelector('.player');
    if (element) element.style.transform = `rotate(${player.heading}deg)`;
  }

  const distanceToTruck = meters(player, truck);
  if (distanceToTruck < 15 && mission !== 'complete') {
    setPrompt('Enter fire engine', 'enter');
  } else if (activeCall && meters(player, activeCall) < 22 && mission === 'onscene') {
    setPrompt(activeCall.type === 'fire' ? 'Hold to operate hose' : activeCall.type === 'medical' ? 'Hold to treat patient' : 'Hold to stabilize vehicle', 'work', 'SPACE');
  } else {
    clearPrompt();
  }

  if (actionHeld && promptAction === 'work') {
    taskProgress = clamp(taskProgress + dt * (activeCall.type === 'fire' ? 25 : 20), 0, 100);
    ui.progress.style.width = `${taskProgress}%`;
    if (activeCall.type === 'fire') {
      if (hoseLine) hoseLine.remove();
      hoseLine = L.polyline([[player.lat, player.lng], [activeCall.lat, activeCall.lng]], { color: '#7dd3fc', weight: 5, opacity: .86, interactive: false }).addTo(map);
    }
    if (taskProgress >= 100) completeCall();
  } else if (hoseLine) {
    hoseLine.remove();
    hoseLine = null;
  }
}

function updateTruck(dt) {
  let x = analog.x + (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  let y = analog.y + (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  const magnitude = clamp(Math.hypot(x, y), 0, 1);
  const hasDirection = magnitude > .08;
  const maxForward = keys.boost ? 31 : 25;
  const acceleration = keys.boost ? 24 : 18;
  const braking = 34;

  if (hasDirection) {
    const targetHeading = normalizeHeading(Math.atan2(x, -y) * 180 / Math.PI);
    const difference = angleDifference(truck.heading, targetHeading);
    const maxTurn = (Math.abs(truck.speed) < 5 ? 520 : 360) * dt;
    truck.heading = normalizeHeading(truck.heading + clamp(difference, -maxTurn, maxTurn));
    const alignment = 1 - Math.min(1, Math.abs(difference) / 150);
    const desiredSpeed = maxForward * (.32 + .68 * magnitude) * (.55 + .45 * alignment);
    truck.speed = approach(truck.speed, desiredSpeed, acceleration * dt);
  } else {
    truck.speed = approach(truck.speed, 0, 13 * dt);
  }

  if (keys.brake) truck.speed = approach(truck.speed, 0, braking * dt);
  if (Math.abs(truck.speed) < .04) truck.speed = 0;

  const previous = { lat: truck.lat, lng: truck.lng };
  const candidate = pointFrom(truck, truck.heading, truck.speed * dt);
  if (roads.status === 'ready') {
    const result = resolveRoadMovement(previous.lat, previous.lng, candidate.lat, candidate.lng, truck.speed);
    truck.lat = result.lat;
    truck.lng = result.lng;
    if (result.snapped && result.segment) truck.heading = headingForSegment(result.segment, truck.heading);
    if (result.blocked) {
      truck.speed *= ROAD_CONFIG.collisionSpeedRetention;
      roads.collisions += 1;
      ui.roadLock.textContent = 'Road edge · sliding';
      ui.roadLock.className = 'road-lock blocked';
      clearTimeout(updateTruck.roadTimer);
      updateTruck.roadTimer = setTimeout(() => {
        ui.roadLock.textContent = `Road lock active · ${roads.segments.length.toLocaleString()}`;
        ui.roadLock.className = 'road-lock';
      }, 650);
    }
  } else {
    truck.lat = previous.lat;
    truck.lng = previous.lng;
    truck.speed = 0;
  }

  refreshTruckMarker();
  ui.speed.textContent = `${Math.round(Math.abs(truck.speed) * 3.6)} km/h`;
  if (routeLine && activeCall) routeLine.setLatLngs([[truck.lat, truck.lng], [activeCall.lat, activeCall.lng]]);

  if (activeCall && meters(truck, activeCall) < 70 && mission === 'enroute') {
    mission = 'arrival';
    truck.speed *= .35;
    updateMission(`${activeCall.label} · ARRIVING`, activeCall.title, activeCall.address, 'Stop, exit the engine, and approach the incident.');
    showToast('ARRIVING ON SCENE');
  }
  if (Math.abs(truck.speed) < 1.2) setPrompt('Exit fire engine', 'exit');
  else clearPrompt();
}

function updateCamera(dt) {
  cameraCooldown -= dt;
  if (cameraCooldown > 0) return;
  cameraCooldown = .06;
  const target = mode === 'truck' ? truck : player;
  map.panTo([target.lat, target.lng], { animate: true, duration: .18, easeLinearity: .7, noMoveStart: true });
}
function updateUI() {
  if (callStartedAt && activeCall && mission !== 'complete') ui.timer.textContent = formatTime(performance.now() - callStartedAt);
  else ui.timer.textContent = formatTime(performance.now() - startedAt);
  if (mode === 'foot') ui.speed.textContent = 'ON FOOT';
}
function loop(now) {
  const dt = Math.min(.04, (now - lastTime) / 1000 || 0);
  lastTime = now;
  if (!ui.start.classList.contains('hidden')) {
    requestAnimationFrame(loop);
    return;
  }
  if (!ui.end.classList.contains('show')) {
    mode === 'foot' ? updateFoot(dt) : updateTruck(dt);
    updateCamera(dt);
    updateUI();
  }
  requestAnimationFrame(loop);
}
