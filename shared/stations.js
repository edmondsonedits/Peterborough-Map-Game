(() => {
  const stations = Object.freeze([
    Object.freeze({
      id: 'station-1',
      number: 1,
      name: 'Station 1',
      address: '210 Sherbrooke St',
      lat: 44.300871,
      lng: -78.322206
    }),
    Object.freeze({
      id: 'station-2',
      number: 2,
      name: 'Station 2',
      address: '100 Marina Blvd',
      lat: 44.335266,
      lng: -78.316657
    }),
    Object.freeze({
      id: 'station-3',
      number: 3,
      name: 'Station 3',
      address: '839 Clonsilla Ave',
      lat: 44.284867,
      lng: -78.350902
    })
  ]);

  window.PTBO_STATIONS = stations;
  window.getPtboStation = number => stations.find(station => station.number === Number(number));
})();
