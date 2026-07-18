(() => {
  'use strict';

  if (window.__geoScoreboardCompatInstalled) return;
  window.__geoScoreboardCompatInstalled = true;

  const firebaseConfig = {
    apiKey: 'AIzaSyA5_GrKYKporIPhwXF6FN0Gp0iP_k8wb0I',
    authDomain: 'geo-guesser-scoreboard.firebaseapp.com',
    projectId: 'geo-guesser-scoreboard',
    storageBucket: 'geo-guesser-scoreboard.firebasestorage.app',
    messagingSenderId: '178277330129',
    appId: '1:178277330129:web:1ed67ca588885fdf3869f0'
  };

  const byId = id => document.getElementById(id);
  const safeText = value => String(value ?? '');
  const formatTime = value => `${Number(value).toFixed(1)}s`;

  function escapeMarkup(value) {
    const element = document.createElement('div');
    element.textContent = safeText(value);
    return element.innerHTML;
  }

  function context() {
    const value = typeof window.geoScoreContext === 'function' ? window.geoScoreContext() : {};
    return {
      responseTimeSeconds: Number(value.responseTimeSeconds),
      station: safeText(value.station || 'Unknown Station'),
      callType: safeText(value.callType || 'Random Shift')
    };
  }

  function playerName() {
    const name = safeText(byId('player')?.value).trim() || 'Anonymous';
    return name.slice(0, 30);
  }

  function setListMessage(id, message) {
    const list = byId(id);
    if (list) list.innerHTML = `<p class="muted" style="text-align:center">${escapeMarkup(message)}</p>`;
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

  function errorText(error) {
    const code = safeText(error?.code).replace(/^firestore\//, '');
    const message = safeText(error?.message || error || 'Unknown Firebase error');
    return code ? `${code}: ${message}` : message;
  }

  function withTimeout(promise, milliseconds, label) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(milliseconds / 1000)} seconds.`)), milliseconds);
      })
    ]).finally(() => clearTimeout(timer));
  }

  let db;
  let scoresCollection;

  const readyPromise = (async () => {
    if (!window.firebase?.initializeApp) throw new Error('Firebase App SDK did not load.');
    if (!window.firebase?.firestore) throw new Error('Cloud Firestore SDK did not load.');

    const app = firebase.apps.find(candidate => candidate.options?.projectId === firebaseConfig.projectId)
      || firebase.initializeApp(firebaseConfig, 'geo-guesser-scoreboard');

    db = app.firestore();
    try {
      db.settings({
        experimentalAutoDetectLongPolling: true,
        ignoreUndefinedProperties: true
      });
    } catch (error) {
      if (error?.code !== 'failed-precondition') console.warn('Firestore settings were not applied.', error);
    }

    scoresCollection = db.collection('scores');
    await withTimeout(scoresCollection.limit(1).get({ source: 'server' }), 15000, 'Firebase connection');
    document.documentElement.dataset.scoreboard = 'online';
    return true;
  })().catch(error => {
    document.documentElement.dataset.scoreboard = 'offline';
    console.error('Firebase scoreboard initialization failed:', error);
    throw error;
  });

  async function fetchScores() {
    await readyPromise;
    const snapshot = await withTimeout(scoresCollection.limit(500).get({ source: 'server' }), 15000, 'Scoreboard download');
    return snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(score => Number.isFinite(Number(score.responseTimeSeconds)));
  }

  window.showPersonalScores = async stationName => {
    const selectedStation = stationName || 'Station 1';
    window.show('scores');
    document.querySelectorAll('.score-tab').forEach(button => {
      button.classList.toggle('active', button.dataset.station === selectedStation);
    });
    setListMessage('score-list', 'Connecting to the online scoreboard…');
    try {
      const scores = (await fetchScores())
        .filter(score => score.callType === 'Random Shift' && score.station === selectedStation)
        .sort((a, b) => Number(a.responseTimeSeconds) - Number(b.responseTimeSeconds));
      renderRows('score-list', scores, score => score.callType);
    } catch (error) {
      setListMessage('score-list', `Scoreboard error: ${errorText(error)}`);
    }
  };

  window.showCityTenScores = async () => {
    window.show('city-ten-scores');
    const note = byId('city-ten-scores')?.querySelector('.leaderboard-note');
    if (note) note.textContent = 'Each player’s fastest online City Ten result is shown once.';
    setListMessage('city-ten-list', 'Connecting to the online scoreboard…');
    try {
      const cityScores = (await fetchScores()).filter(score => score.callType === 'The City Ten');
      const bestByPlayer = new Map();
      cityScores.forEach(score => {
        const key = safeText(score.playerName || 'Anonymous').trim().toLocaleLowerCase();
        const current = bestByPlayer.get(key);
        if (!current || Number(score.responseTimeSeconds) < Number(current.responseTimeSeconds)) bestByPlayer.set(key, score);
      });
      const best = [...bestByPlayer.values()].sort((a, b) => Number(a.responseTimeSeconds) - Number(b.responseTimeSeconds));
      renderRows('city-ten-list', best, score => score.station || 'Unknown Station');
    } catch (error) {
      setListMessage('city-ten-list', `Scoreboard error: ${errorText(error)}`);
    }
  };

  window.showScores = () => {
    const stationName = context().station;
    window.showPersonalScores(stationName.startsWith('Station ') ? stationName : 'Station 1');
  };

  window.saveScore = async () => {
    const saveButton = byId('score-row')?.querySelector('button');
    const scoreContext = context();
    if (!Number.isFinite(scoreContext.responseTimeSeconds) || scoreContext.responseTimeSeconds < 0) {
      alert('The score could not be calculated. Finish a timed game and try again.');
      return;
    }

    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Connecting…';
    }

    try {
      await readyPromise;
      if (saveButton) saveButton.textContent = 'Saving…';
      const name = playerName();
      await withTimeout(scoresCollection.add({
        playerName: name,
        station: scoreContext.station,
        callType: scoreContext.callType,
        responseTimeSeconds: scoreContext.responseTimeSeconds,
        score: scoreContext.responseTimeSeconds,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }), 15000, 'Score upload');
      try { localStorage.setItem('geoPlayerName', name); } catch {}
      if (scoreContext.callType === 'The City Ten') await window.showCityTenScores();
      else await window.showPersonalScores(scoreContext.station);
    } catch (error) {
      alert(`Scoreboard error: ${errorText(error)}`);
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
  window.__geoScoreboardReadyPromise = readyPromise;
})();