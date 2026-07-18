(() => {
  if (window.__geoFirebaseScoreboardInstalled) return;
  window.__geoFirebaseScoreboardInstalled = true;

  const projectId = 'geo-guesser-scoreboard';
  const apiKey = 'AIzaSyA5_GrKYKporIPhwXF6FN0Gp0iP_k8wb0I';
  const collectionUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/scores`;
  const byId = id => document.getElementById(id);
  const safeText = value => String(value ?? '');
  const formatTime = value => `${Number(value).toFixed(1)}s`;

  function context() {
    const value = typeof window.geoScoreContext === 'function' ? window.geoScoreContext() : {};
    return {
      responseTimeSeconds: Number(value.responseTimeSeconds),
      station: safeText(value.station || 'Unknown Station'),
      callType: safeText(value.callType || 'Random Shift')
    };
  }

  function playerName() {
    const input = byId('player');
    const name = safeText(input?.value).trim() || 'Anonymous';
    return name.slice(0, 30);
  }

  function escapeMarkup(value) {
    const element = document.createElement('div');
    element.textContent = safeText(value);
    return element.innerHTML;
  }

  function setListMessage(id, message) {
    const list = byId(id);
    if (!list) return;
    list.innerHTML = `<p class="muted" style="text-align:center">${escapeMarkup(message)}</p>`;
  }

  function renderRows(id, rows, extraLine) {
    const list = byId(id);
    if (!list) return;
    if (!rows.length) {
      setListMessage(id, 'No online scores recorded yet.');
      return;
    }
    list.innerHTML = rows.slice(0, 50).map((score, index) => {
      const secondary = extraLine ? extraLine(score) : '';
      return `<div class="item" style="display:flex;justify-content:space-between;gap:14px;align-items:center">
        <div><strong>#${index + 1} ${escapeMarkup(score.playerName || 'Anonymous')}</strong>${secondary ? `<div class="muted">${escapeMarkup(secondary)}</div>` : ''}</div>
        <span style="color:var(--green);font-weight:bold;white-space:nowrap">${formatTime(score.responseTimeSeconds)}</span>
      </div>`;
    }).join('');
  }

  function decodeValue(value = {}) {
    if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
    if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
    if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
    if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
    if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return Boolean(value.booleanValue);
    return null;
  }

  function decodeDocument(documentValue) {
    const decoded = { id: safeText(documentValue?.name).split('/').pop() };
    Object.entries(documentValue?.fields || {}).forEach(([key, value]) => {
      decoded[key] = decodeValue(value);
    });
    return decoded;
  }

  async function firestoreRequest(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || `Firestore request failed (${response.status})`;
      throw new Error(message);
    }
    return payload;
  }

  async function fetchScores() {
    const scores = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({ key: apiKey, pageSize: '100' });
      if (pageToken) params.set('pageToken', pageToken);
      const payload = await firestoreRequest(`${collectionUrl}?${params}`);
      scores.push(...(payload.documents || []).map(decodeDocument));
      pageToken = payload.nextPageToken || '';
    } while (pageToken && scores.length < 1000);
    return scores.filter(score => Number.isFinite(Number(score.responseTimeSeconds)));
  }

  async function createScore(score) {
    const params = new URLSearchParams({ key: apiKey });
    return firestoreRequest(`${collectionUrl}?${params}`, {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          playerName: { stringValue: score.playerName },
          station: { stringValue: score.station },
          callType: { stringValue: score.callType },
          responseTimeSeconds: { doubleValue: score.responseTimeSeconds },
          score: { doubleValue: score.score },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      })
    });
  }

  window.showPersonalScores = async stationName => {
    window.show('scores');
    document.querySelectorAll('.score-tab').forEach(button => {
      button.classList.toggle('active', button.dataset.station === stationName);
    });
    setListMessage('score-list', 'Loading online scores…');
    try {
      const scores = (await fetchScores())
        .filter(score => score.callType === 'Random Shift' && score.station === stationName)
        .sort((a, b) => Number(a.responseTimeSeconds) - Number(b.responseTimeSeconds));
      renderRows('score-list', scores, score => score.callType);
    } catch (error) {
      console.error('Could not load Random Shift scoreboard:', error);
      setListMessage('score-list', `Could not connect to the online scoreboard: ${error.message}`);
    }
  };

  window.showCityTenScores = async () => {
    window.show('city-ten-scores');
    const note = byId('city-ten-scores')?.querySelector('.leaderboard-note');
    if (note) note.textContent = 'Each player’s fastest online City Ten result is shown once.';
    setListMessage('city-ten-list', 'Loading online scores…');
    try {
      const cityScores = (await fetchScores()).filter(score => score.callType === 'The City Ten');
      const bestByPlayer = new Map();
      cityScores.forEach(score => {
        const key = safeText(score.playerName || 'Anonymous').trim().toLocaleLowerCase();
        const current = bestByPlayer.get(key);
        if (!current || Number(score.responseTimeSeconds) < Number(current.responseTimeSeconds)) {
          bestByPlayer.set(key, score);
        }
      });
      const best = [...bestByPlayer.values()]
        .sort((a, b) => Number(a.responseTimeSeconds) - Number(b.responseTimeSeconds));
      renderRows('city-ten-list', best, score => score.station || 'Unknown Station');
    } catch (error) {
      console.error('Could not load City Ten scoreboard:', error);
      setListMessage('city-ten-list', `Could not connect to the online scoreboard: ${error.message}`);
    }
  };

  window.showScores = () => {
    const currentStation = context().station;
    window.showPersonalScores(currentStation.startsWith('Station ') ? currentStation : 'Station 1');
  };

  window.saveScore = async () => {
    const saveButton = byId('score-row')?.querySelector('button');
    const scoreContext = context();
    if (!Number.isFinite(scoreContext.responseTimeSeconds) || scoreContext.responseTimeSeconds < 0) {
      alert('The score could not be calculated. Please finish another timed game and try again.');
      return;
    }

    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Saving…';
    }

    try {
      const name = playerName();
      await createScore({
        playerName: name,
        station: scoreContext.station,
        callType: scoreContext.callType,
        responseTimeSeconds: scoreContext.responseTimeSeconds,
        score: scoreContext.responseTimeSeconds
      });
      try { localStorage.setItem('geoPlayerName', name); } catch {}
      if (scoreContext.callType === 'The City Ten') {
        await window.showCityTenScores();
      } else {
        await window.showPersonalScores(scoreContext.station);
      }
    } catch (error) {
      console.error('Could not save score:', error);
      alert(`The score could not be saved online: ${error.message}`);
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = 'Save';
      }
    }
  };

  const nameInput = byId('player');
  if (nameInput) {
    try { nameInput.value = localStorage.getItem('geoPlayerName') || ''; } catch {}
    nameInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        window.saveScore();
      }
    });
  }

  window.__geoScoreboardReady = true;
  document.documentElement.dataset.scoreboard = 'connecting';
  fetchScores().then(() => {
    document.documentElement.dataset.scoreboard = 'online';
  }).catch(error => {
    document.documentElement.dataset.scoreboard = 'offline';
    console.error('Firestore REST scoreboard connection check failed:', error);
  });
})();
