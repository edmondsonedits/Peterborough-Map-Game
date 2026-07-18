(function () {
  "use strict";

  function chooseUniqueCalls(pool, count, stationDistrict, random = Math.random) {
    const available = Array.isArray(pool) ? [...pool] : [];
    const selected = [];
    while (selected.length < count && available.length > 0) {
      const districtPool = available.filter((location) => Number(location.district) === Number(stationDistrict));
      const candidates = districtPool.length > 0 && (random() < 0.75 || districtPool.length === available.length)
        ? districtPool
        : available;
      const selectedIndex = Math.floor(random() * candidates.length);
      const selectedLocation = candidates[selectedIndex];
      const availableIndex = available.indexOf(selectedLocation);
      if (availableIndex < 0) break;
      available.splice(availableIndex, 1);
      selected.push(selectedLocation);
    }
    return selected;
  }

  function createElapsedTimer(render) {
    let startedAtMs = null;
    let pausedElapsedMs = 0;
    let animationFrameId = null;
    function elapsedTimeMs() { return Math.round(pausedElapsedMs + (startedAtMs === null ? 0 : performance.now() - startedAtMs)); }
    function tick() { render(elapsedTimeMs()); animationFrameId = requestAnimationFrame(tick); }
    return Object.freeze({
      start() { if (startedAtMs === null) { startedAtMs = performance.now(); animationFrameId = requestAnimationFrame(tick); } },
      stop() { if (startedAtMs !== null) { pausedElapsedMs = elapsedTimeMs(); startedAtMs = null; } if (animationFrameId !== null) cancelAnimationFrame(animationFrameId); animationFrameId = null; },
      reset() { this.stop(); pausedElapsedMs = 0; render(0); },
      valueMs: elapsedTimeMs
    });
  }

  window.PeterboroughGameUtils = Object.freeze({ chooseUniqueCalls, createElapsedTimer });
}());
