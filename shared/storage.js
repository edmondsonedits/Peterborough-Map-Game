(function () {
  "use strict";

  const STORAGE_PREFIX = "peterborough-emergency-games";

  function storageKey(name, version) {
    return `${STORAGE_PREFIX}:${name}:v${version}`;
  }

  function getStorage() {
    try {
      const storage = window.localStorage;
      const probe = `${STORAGE_PREFIX}:probe`;
      storage.setItem(probe, "1");
      storage.removeItem(probe);
      return storage;
    } catch (_) {
      return null;
    }
  }

  function read(name, version, fallback, validate) {
    const storage = getStorage();
    if (!storage) return fallback;
    try {
      const rawValue = storage.getItem(storageKey(name, version));
      if (rawValue === null) return fallback;
      const parsedValue = JSON.parse(rawValue);
      return validate(parsedValue) ? parsedValue : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function write(name, version, value) {
    const storage = getStorage();
    if (!storage) return false;
    try {
      storage.setItem(storageKey(name, version), JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function isScoreList(value) {
    return Array.isArray(value) && value.every((score) => score && typeof score === "object" &&
      typeof score.name === "string" && Number.isFinite(score.elapsedTimeMs) && typeof score.mode === "string");
  }

  window.PeterboroughStorage = Object.freeze({ read, write, isScoreList });
}());
