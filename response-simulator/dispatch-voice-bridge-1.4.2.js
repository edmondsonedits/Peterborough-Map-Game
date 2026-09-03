(() => {
  'use strict';
  const VERSION = '1.6.5';
  if (window.PTBO_DISPATCH_VOICE_BRIDGE_VERSION === VERSION) return;
  window.PTBO_DISPATCH_VOICE_BRIDGE_VERSION = VERSION;

  const city = window.PTBO_CITY_PACKAGE;
  const stations = city?.serviceConfig?.profiles?.fire?.bases || window.PTBO_STATIONS || [];
  const controlName = city?.dispatch?.controlName || `${city?.name || 'City'} Control`;
  const callNames = {
    'Structure Fire':'a structure fire',
    'Water & Ice Rescue':'a water rescue',
    'Auto Alarm / Vehicle Fire':'an auto alarm',
    'Burning Complaint':'a burning complaint',
    'Alarms No Apparent Problem':'an alarm with no apparent problem',
    'Chest Pain / Cardiac Emergency':'a cardiac emergency',
    'Difficulty Breathing':'difficulty breathing',
    'Unconscious Patient / Substance Overdose':'an unconscious patient or possible overdose',
    'Rectal Bleed / Gastrointestinal Emergency':'a gastrointestinal emergency',
    'Lift Assist / Public Service':'a lift assist',
    'Request for Access / Wellness Check':'a request for access or wellness check',
  };

  const parentWindow = (() => { try { return window.parent; } catch (_) { return null; } })();
  const stationName = number => (stations.find(station => station.number === Number(number)) || stations[0] || {name:'Station'}).name;
  const selectedStation = () => Number(parentWindow?.ptboGetSelectedStationNumber?.() || 1);
  const voiceEnabled = () => parentWindow?.ptboDispatchVoiceEnabled?.() !== false;

  function secondMvcStation(primary, incident) {
    return stations.filter(station => station.number !== primary)
      .sort((a,b) => mapInstance.distance([a.lat,a.lng],[incident.lat,incident.lng]) - mapInstance.distance([b.lat,b.lng],[incident.lat,incident.lng]))[0];
  }

  window.buildCityDispatchPhrase = incident => {
    if (!incident) return '';
    const servicePhrase = window.PTBO_SERVICE?.dispatchPhrase(incident);
    if (servicePhrase) return servicePhrase;
    const primary = selectedStation();
    if (['Structure Fire','Water & Ice Rescue','Auto Alarm / Vehicle Fire'].includes(incident.sub)) {
      return `All stations from ${controlName}, you’re responding to ${callNames[incident.sub]} at ${incident.name}, ${incident.addr}.`;
    }
    if (incident.sub === 'Motor Vehicle Collision') {
      const secondary = secondMvcStation(primary,incident);
      return `${stationName(primary)} and ${stationName(secondary?.number)} from ${controlName}, you’re responding to an M V C at the intersection ${incident.addr}.`;
    }
    return `${stationName(primary)} from ${controlName}, you’re responding to ${callNames[incident.sub] || String(incident.sub || '').toLowerCase()} at the address ${incident.addr}.`;
  };
  window.buildPeterboroughDispatchPhrase = window.buildCityDispatchPhrase;

  window.playDispatchAudioText = () => {
    if (!voiceEnabled()) return;
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(window.buildCityDispatchPhrase(activeIncident));
      utterance.rate = 1;
      utterance.pitch = .95;
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.warn('TTS engine failure:',error);
    }
  };
})();
