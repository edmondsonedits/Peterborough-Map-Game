(function (root) {
  'use strict';

  function isValidLocation(location) {
    if (location?.lat === null || location?.lng === null || location?.radius === null ||
      location?.lat === '' || location?.lng === '' || location?.radius === '') return false;
    return Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lng)) &&
      Math.abs(Number(location.lat)) <= 90 && Math.abs(Number(location.lng)) <= 180 &&
      Number.isFinite(Number(location?.radius)) && Number(location.radius) > 0;
  }

  function serviceLocations(locations, service) {
    const expected = service === 'ems' ? 'Medical' : 'Fire';
    return (Array.isArray(locations) ? locations : []).filter(location =>
      location?.main === expected && isValidLocation(location));
  }

  function shuffledCycle(pool, random = Math.random) {
    const source = pool.slice();
    let deck = [], previous = null;
    return {
      next() {
        if (!source.length) return null;
        if (!deck.length) {
          deck = source.slice();
          for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
          }
          if (deck.length > 1 && deck[0] === previous) [deck[0], deck[1]] = [deck[1], deck[0]];
        }
        previous = deck.shift();
        return previous;
      }
    };
  }

  function createSession(options = {}) {
    const cycle = shuffledCycle(options.locations || [], options.random || Math.random);
    const schedule = options.setTimeout || setTimeout;
    const cancel = options.clearTimeout || clearTimeout;
    const onNext = options.onNext || (() => {});
    const delay = Number.isFinite(options.delay) ? options.delay : 1000;
    const stats = { completed: 0, firstTry: 0, assisted: 0, misses: 0, streak: 0, bestStreak: 0 };
    let timer = null, generation = 0, attempts = 0;
    const state = { target: cycle.next(), revealed: false, pending: false, ended: false };

    function advance(token = generation) {
      if (state.ended || token !== generation || !state.pending) return false;
      state.pending = false;
      state.revealed = false;
      attempts = 0;
      state.target = cycle.next();
      onNext(state.target, { ...stats });
      return true;
    }
    function clearPending() {
      generation++;
      if (timer !== null) cancel(timer);
      timer = null;
      state.pending = false;
    }

    return {
      state, stats,
      guess(distanceMeters, radiusMeters) {
        if (state.ended || state.pending || state.revealed || !state.target) return { accepted: false };
        attempts++;
        if (!(Number.isFinite(distanceMeters) && Number.isFinite(radiusMeters) && radiusMeters > 0 && distanceMeters <= radiusMeters)) {
          stats.misses++;
          stats.streak = 0;
          return { accepted: true, correct: false, attempts };
        }
        stats.completed++;
        stats.streak++;
        stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
        if (attempts === 1) stats.firstTry++;
        state.pending = true;
        const token = ++generation;
        timer = schedule(() => { timer = null; advance(token); }, delay);
        return { accepted: true, correct: true, firstTry: attempts === 1, stats: { ...stats } };
      },
      reveal() {
        if (state.ended || state.pending || state.revealed || !state.target) return false;
        stats.completed++;
        stats.assisted++;
        stats.streak = 0;
        state.revealed = true;
        return true;
      },
      continueRevealed() {
        if (state.ended || !state.revealed) return false;
        state.pending = true;
        return advance(generation);
      },
      finish() { state.ended = true; clearPending(); },
      cancel() { state.ended = true; clearPending(); }
    };
  }

  root.PTBO_STATION_PRACTICE = Object.freeze({ isValidLocation, serviceLocations, shuffledCycle, createSession });
})(typeof window === 'undefined' ? globalThis : window);
