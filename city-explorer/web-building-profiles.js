 // Appearance estimates on existing mapped footprints; no imagery is used at runtime.
export const WEB_BUILDING_PROFILES = Object.freeze([
  {
    id: 'way/1005977973',
    label: 'WEB-PAPPAS',
    name: 'Pappas Building',
    confidence: 'partial',
    height: 11.7,
    eaveHeight: 11.7,
    roof: 'flat',
    roofRise: 0,
    wallColor: '#ded9ce',
    roofColor: '#514943',
    trimColor: '#513c4a',
    corniceColor: '#513c4a',
    levels: 3,
    windowColumns: 6,
    windowWidthMetres: 1.2,
    windowHeightMetres: 2.05,
    style: 'office',
    largeGlazedFront: true,
    doorFraction: 0.52,
    features: ['corbelled-cornice'],
    facadePanels: [
      {fraction: 0.06, bottomMetres: 0, widthFraction: 0.035, heightMetres: 3.45, color: '#513c4a', outsetMetres: 0.2},
      {fraction: 0.31, bottomMetres: 0, widthFraction: 0.035, heightMetres: 3.45, color: '#513c4a', outsetMetres: 0.2},
      {fraction: 0.62, bottomMetres: 0, widthFraction: 0.035, heightMetres: 3.45, color: '#513c4a', outsetMetres: 0.2},
      {fraction: 0.94, bottomMetres: 0, widthFraction: 0.035, heightMetres: 3.45, color: '#513c4a', outsetMetres: 0.2}
    ],
    frontLatLon: [
      {lat: 44.3061271, lon: -78.3201981},
      {lat: 44.306238, lon: -78.3202055}
    ],
    frontSource: 'First OSM footprint edge, checked against the nearest George Street North road geometry.',
    notes: 'Facade appearance is adapted from a 2012 exterior photograph. Three storeys, six upper window columns, cream painted masonry, plum trim, ground-floor glazing and a flat parapet are visible. Eave height is visually estimated; roof color is an unseen neutral material estimate. Upper window surrounds are simplified as rectangular frames.'
  },
  {
    id: 'way/1006243570',
    label: 'WEB-CORK',
    name: 'Cork & Bean',
    confidence: 'partial',
    height: 3.9,
    detailHeightMetres: 3.9,
    preserveMappedMassing: true,
    roof: 'flat',
    roofRise: 0,
    wallColor: '#b6aa8b',
    roofColor: '#605a50',
    trimColor: '#eee9dc',
    signBoardColor: '#975b3b',
    signBackgroundColor: '#975b3b',
    signTextColor: '#f4eee2',
    signText: 'Cork & Bean',
    signWidthMetres: 5.8,
    signHeightMetres: 3.22,
    signBoardHeightMetres: 0.8,
    signOutsetMetres: 0.34,
    levels: 1,
    windowColumns: 2,
    style: 'office',
    blankFacade: true,
    skipGroundWindows: true,
    groundWindows: [
      {t: 0.13, bottom: 0.35, width: 1.45, height: 2.55},
      {t: 0.33, bottom: 0.35, width: 1.45, height: 2.55},
      {t: 0.53, bottom: 0.35, width: 1.45, height: 2.55},
      {t: 0.71, bottom: 0.35, width: 0.8, height: 2.55},
      {t: 0.88, bottom: 0.05, width: 0.62, height: 2.75}
    ],
    facadePanels: [
      {fraction: 0.055, bottomMetres: 0.12, widthFraction: 0.025, heightMetres: 3.05, color: '#eee9dc', outsetMetres: 0.18},
      {fraction: 0.46, bottomMetres: 0.12, widthFraction: 0.025, heightMetres: 3.05, color: '#eee9dc', outsetMetres: 0.18},
      {fraction: 0.79, bottomMetres: 0.12, widthFraction: 0.025, heightMetres: 3.05, color: '#eee9dc', outsetMetres: 0.18}
    ],
    frontLatLon: [
      {lat: 44.3053507, lon: -78.3198811},
      {lat: 44.3052776, lon: -78.3198745}
    ],
    frontSource: 'First OSM footprint edge, checked against the nearest George Street North road geometry.',
    notes: 'The available storefront photo is cropped above the sign/fascia and does not establish upper floors or roof height. Keep the mapped building mass; add only the observed buff wall, rust fascia/sign, pale narrow frames, glazing and recessed right-side entrance cue. Roof color is an unseen neutral material estimate.'
  }
]);
