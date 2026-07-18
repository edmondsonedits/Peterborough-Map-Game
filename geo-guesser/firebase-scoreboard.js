import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

if (!window.__geoFirebaseScoreboardInstalled) {
  window.__geoFirebaseScoreboardInstalled = true;

  const firebaseConfig = {
    apiKey: 'AIzaSyA5_GrKYKporIPhwXF6FN0Gp0iP_k8wb0I',
    authDomain: 'geo-guesser-scoreboard.firebaseapp.com',
    projectId: 'geo-guesser-scoreboard',
    storageBucket: 'geo-guesser-scoreboard.firebasestorage.app',
    messagingSenderId: '178277330129',
    appId: '1:178277330129:web:1ed67ca588885fdf3869f0'
  };

  const app = getApps().find(candidate => candidate.options.projectId === firebaseConfig.projectId)
    || initializeApp(firebaseConfig, 'geo-guesser-scoreboard');
  const db = getFirestore(app);
  const scoresCollection = collection(db, 'scores');
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

  function setListMessage(id, message) {
    const list = byId(id);
    if (list) list.innerHTML = `<p class="muted" style="text-align:center">${safeText(message)}</p>`;
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

  function escapeMarkup(value) {
    const element = document.createElement('div');
    element.textContent = safeText(value);
    return element.innerHTML;
  }

  async function fetchScores() {
    const snapshot = await getDocs(scoresCollection);
    return snapshot.docs.map(documentSnapshot => ({ id: documentSnapshot.id, ...documentSnapshot.data() }))
      .filter(score => Number.isFinite(Number(score.responseTimeSeconds)));
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
      setListMessage('score-list', 'Could not connect to the online scoreboard. Check Firebase Rules and your internet connection.');
    }
  };

  window.showCityTenScores = async () => {
    window.show('city-ten-scores');
    const note = byId('city-ten-scores')?.querySelector('.leaderboard-note');
    if (note) note.textContent = 'Each player’s fastest online City Ten result is shown once.';
    setListMessage('city-ten-list', 'Loading online scores…');
    try {
      const cityScores = (await fetchScores())
        .filter(score => score.callType === 'The City Ten');
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
      setListMessage('city-ten-list', 'Could not connect to the online scoreboard. Check Firebase Rules and your internet connection.');
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
      await addDoc(scoresCollection, {
        playerName: name,
        station: scoreContext.station,
        callType: scoreContext.callType,
        responseTimeSeconds: scoreContext.responseTimeSeconds,
        score: scoreContext.responseTimeSeconds,
        createdAt: serverTimestamp()
      });
      try { localStorage.setItem('geoPlayerName', name); } catch {}
      if (scoreContext.callType === 'The City Ten') {
        await window.showCityTenScores();
      } else {
        await window.showPersonalScores(scoreContext.station);
      }
    } catch (error) {
      console.error('Could not save score:', error);
      alert('The score could not be saved online. Check your connection and Firebase Rules, then try again.');
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

  getDocs(query(scoresCollection, limit(1))).then(() => {
    document.documentElement.dataset.scoreboard = 'online';
  }).catch(error => {
    document.documentElement.dataset.scoreboard = 'offline';
    console.error('Firebase scoreboard connection check failed:', error);
  });
}
