(function (root) {
  'use strict';

  function isValidLocation(location) {
    if (location?.lat === null || location?.lng === null || location?.radius === null ||
      location?.lat === '' || location?.lng === '' || location?.radius === '') return false;
    return Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lng)) &&
      Math.abs(Number(location.lat)) <= 90 && Math.abs(Number(location.lng)) <= 180 &&
      Number.isFinite(Number(location?.radius)) && Number(location.radius) > 0;
  }

  function serviceLocations(locations, service, difficulty) {
    const candidates=Array.isArray(locations) ? locations : [];
    const eligible=root.PTBO_EMS_PRIORITY?.eligibleCandidates
      ? root.PTBO_EMS_PRIORITY.eligibleCandidates(candidates,service)
      : candidates.filter(location=>!Array.isArray(location?.trainingServices)||location.trainingServices.includes(service));
    return eligible.filter(location => {
      const priorityCareHome=service==='ems'&&location.facilityType==='long-term-care';
      return ((!difficulty || location.recognitionDifficulty === difficulty) || priorityCareHome) && isValidLocation(location);
    });
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
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const locations = Array.isArray(options.locations) ? options.locations : [];
    const cycle = shuffledCycle(locations, random);
    const onNext = options.onNext || (() => {});
    const stats = { completed: 0, firstTry: 0, assisted: 0, misses: 0, streak: 0, bestStreak: 0 };
    let generation = 0, attempts = 0, nextAllowedAt = 0;
    let lastTarget=null;
    function nextTarget(){
      const picker=root.PTBO_EMS_PRIORITY?.pick;
      const target=options.service==='ems'&&typeof picker==='function'
        ? picker(locations,{service:'ems',random,lastId:lastTarget?.id,careWeight:options.careWeight})
        : cycle.next();
      lastTarget=target||null;
      return target;
    }
    const state = { target: nextTarget(), revealed: false, pending: false, ended: false };

    function advance(token = generation) {
      if (state.ended || token !== generation || !state.pending) return false;
      state.pending = false;
      state.revealed = false;
      attempts = 0;
      state.target = nextTarget();
      onNext(state.target, { ...stats });
      return true;
    }
    function clearPending() {
      generation++;
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
      next() {
        if (state.ended || !state.target || Date.now() < nextAllowedAt) return false;
        state.pending = true;
        const advanced = advance(generation);
        if (advanced) nextAllowedAt = Date.now() + 300;
        return advanced;
      },
      finish() { state.ended = true; clearPending(); },
      cancel() { state.ended = true; clearPending(); }
    };
  }

  root.PTBO_STATION_PRACTICE = Object.freeze({ isValidLocation, serviceLocations, shuffledCycle, createSession });
})(typeof window === 'undefined' ? globalThis : window);
