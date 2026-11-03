const VALID_STATIONS = new Set([1, 2, 3]);

function stationNumber(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return VALID_STATIONS.has(number) ? number : null;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || 'Station switch failed');
}

/** Coordinate asynchronous station readiness while committing only the latest request. */
export function createStationTransition({ getActive, prepare, commit, onState = () => {} }) {
  if (typeof getActive !== 'function' || typeof prepare !== 'function' || typeof commit !== 'function') {
    throw new TypeError('getActive, prepare, and commit must be functions');
  }

  let latestToken = 0;
  let pending = null;
  let error = null;

  const readActive = () => stationNumber(getActive()) ?? 1;
  const getStatus = () => ({
    stationNumber: readActive(),
    pendingStationNumber: pending?.number ?? null,
    busy: Boolean(pending),
    error,
  });
  const emit = () => {
    try { onState(getStatus()); } catch { /* observers cannot break station transitions */ }
  };
  const outcome = (ok, message) => {
    const status = getStatus();
    return { ok, stationNumber: status.stationNumber, status, ...(message ? { error: message } : {}) };
  };
  const current = request => pending === request && request.token === latestToken;
  const finishStale = request => {
    if (!request.settled) {
      request.settled = true;
      request.resolve(outcome(false));
    }
  };

  function switchTo(value) {
    const number = stationNumber(value);
    if (number === null) return Promise.resolve(outcome(false, 'Invalid station number'));

    if (pending?.number === number) return pending.promise;
    const active = readActive();
    if (number === active) {
      const previous = pending;
      latestToken++;
      pending = null;
      error = null;
      if (previous) finishStale(previous);
      emit();
      return Promise.resolve(outcome(true));
    }

    const previous = pending;
    const request = { number, token: ++latestToken, settled: false };
    pending = request;
    error = null;
    request.promise = new Promise(resolve => { request.resolve = resolve; });
    if (previous) finishStale(previous);
    emit();

    const settle = result => {
      if (request.settled) return;
      request.settled = true;
      request.resolve(result);
    };
    const fail = failure => {
      if (!current(request)) return finishStale(request);
      pending = null;
      error = errorMessage(failure);
      emit();
      settle(outcome(false, error));
    };

    let preparation;
    try {
      preparation = Promise.resolve(prepare(number, { token: request.token, isCurrent: () => current(request) }));
    } catch (failure) {
      preparation = Promise.reject(failure);
    }
    preparation.then(prepared => {
        if (!current(request)) return finishStale(request);
        const committed = commit(number, prepared, { token: request.token, isCurrent: () => current(request) });
        if (committed && typeof committed.then === 'function') {
          throw new TypeError('Station commit must be synchronous');
        }
        if (!current(request)) return finishStale(request);
        const activeAfterCommit = readActive();
        if (activeAfterCommit !== number) throw new Error(`Station ${number} did not become active`);
        pending = null;
        error = null;
        emit();
        settle(outcome(true));
      })
      .catch(fail);

    return request.promise;
  }

  return { switchTo, getStatus };
}
