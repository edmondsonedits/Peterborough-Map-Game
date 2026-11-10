// Six verified sources on the southbound Reid route, R073–R083.
// Frontages are exact adjacent vertices in the current source rings. Appearance
// dimensions/colors are estimates; no source height, roof or collision is replaced.
export const ROUTE_REID_APPEARANCES = {
  'way/446339087': {
    street: 'Reid Street', intersection: 'Reid Street / Edinburgh Street', corner: 'northeast',
    photoIds: ['R074', 'R076', 'R078'], source: 'dense/flat-768/frame_0108_lens1_pitch+0.jpg',
    observation: 'Jiffy Lube has pale walls and a dark red fascia, two gridded garage bays on the north part of its west frontage and a red entrance zone to their south. Readable Jiffy Lube lettering is on the south end of the fascia. A separate garage bay is visible on the south return.',
    estimated: 'All dimensions, colors and fractions are visual estimates. This profile depicts only the mapped west edge: two broad garage panes and one glazed entry. Fine garage grid bars and the separate south-return bay remain deferred. The open apron north and west is untouched. Decorative panes, entry and fascia fit the current 2.60 m rendered wall; the 2.05 m panes are not vehicle-access clearances. The low inferred source height/roof needs separate geometry review before claiming photographic scale.',
    profile: {
      label: 'REID-JIFFY', name: 'Jiffy Lube at Edinburgh', confidence: 'observed',
      frontLatLon: [{lat: 44.3134345, lon: -78.3281535}, {lat: 44.3132778, lon: -78.3281395}],
      style: 'office', levels: 1, windowColumns: 2, detailHeightMetres: 2.6,
    },
    appearance: {
      wallColor: '#c8c5b6', wallSurface: 'render', roofColor: '#474944', trimColor: '#ded9c9', glassColor: '#394f50',
      blankFacade: true,
      groundWindows: [{t: .18, bottom: .08, width: 3.1, height: 2.05}, {t: .44, bottom: .08, width: 3.1, height: 2.05}],
      entryDoor: {fraction: .76, widthMetres: 1.1, heightMetres: 2.05, color: '#c6c7b8'},
      facadePanels: [
        {fraction: .76, widthFraction: .26, bottomMetres: .08, heightMetres: 2.05, color: '#8d3344', outsetMetres: .18},
        {fraction: .5, widthFraction: .99, bottomMetres: 2.14, heightMetres: .42, color: '#803847', outsetMetres: .19},
      ],
      signText: 'JIFFY LUBE', signBusinessName: 'Jiffy Lube', signFont: '700 46px Arial,sans-serif',
      signFraction: .76, signWidthMetres: 3.9, signHeightMetres: 2.3, signBoardHeightMetres: .3,
      signBoardColor: '#803847', signBackgroundColor: '#803847', signTextColor: '#eee9d8', signOutsetMetres: .36,
    },
  },
  'way/1002680974': {
    street: 'Reid Street', intersection: 'Reid Street / Parkhill Road', corner: 'southwest',
    photoIds: ['R073'], source: 'dense/flat-768/frame_0107_lens0_pitch+0.jpg',
    observation: 'The first house south of Parkhill has pale sage siding, two narrow upper windows, white trim, and separate low gray awnings above a lower window and the north-side entry.',
    estimated: 'Opening positions, awning dimensions and colors are visual estimates. The existing render surface is a restrained painted-wall treatment rather than a recreation of horizontal siding boards. One shallow entry canopy and one thin over-window trim approximate the visible awnings. Existing front-gable geometry remains unchanged.',
    profile: {
      label: 'REID-PARKHILL-SW', name: 'Sage house south of Parkhill', confidence: 'observed',
      frontLatLon: [{lat: 44.3135563, lon: -78.3285760}, {lat: 44.3134873, lon: -78.3285716}],
      style: 'house', levels: 2, windowColumns: 2, detailHeightMetres: 5.5,
    },
    appearance: {
      wallColor: '#a5afa1', wallSurface: 'render', roofColor: '#505955', trimColor: '#deded0', glassColor: '#56635f',
      porch: false, skipGroundWindows: true, windowWidthMetres: .76, windowHeightMetres: 1.4,
      groundWindows: [{t: .66, bottom: .75, width: 1.75, height: 1.42}],
      entryDoor: {fraction: .2, widthMetres: .9, heightMetres: 2.18, color: '#d4d5ca'},
      entryCanopy: {fraction: .2, widthMetres: 1.35, heightMetres: 2.55, depthMetres: .52},
      facadePanels: [{fraction: .66, widthFraction: .3, bottomMetres: 2.4, heightMetres: .17, color: '#66716f', outsetMetres: .5}],
    },
  },
  'way/1002680975': {
    street: 'Reid Street', intersection: 'Parkhill Road / Edinburgh Street',
    photoIds: ['R073', 'R075'], source: 'dense/flat-768/frame_0107_lens0_pitch+0.jpg',
    observation: 'The next house south has pale siding, one narrow upper/attic sash and an enclosed glazed porch with pale frames and a red-brown lower wall. Its entry is not a centered open two-post porch.',
    estimated: 'Porch glazing is represented by three bounded panes on the mapped front wall, without asserting a new projecting volume or an unseen entrance. Pane count/spacing, red base height, colors and dimensions are estimates. Painted render is used as a restrained siding-color treatment; siding boards and porch depth are not reconstructed.',
    profile: {
      label: 'REID-PARKHILL-PORCH', name: 'Pale enclosed-porch house south of Parkhill', confidence: 'observed',
      frontLatLon: [{lat: 44.3134402, lon: -78.3285639}, {lat: 44.3133717, lon: -78.3285595}],
      style: 'house', levels: 2, windowColumns: 1, detailHeightMetres: 5.5,
    },
    appearance: {
      wallColor: '#d4d4c9', wallSurface: 'render', roofColor: '#565f59', trimColor: '#dedccb', glassColor: '#697474',
      porch: false, entryDoor: null, skipGroundWindows: true, windowWidthMetres: .74, windowHeightMetres: 1.32,
      groundWindows: [{t: .24, bottom: 1.02, width: 1.12, height: 1.48}, {t: .5, bottom: 1.02, width: 1.12, height: 1.48}, {t: .76, bottom: 1.02, width: 1.12, height: 1.48}],
      facadePanels: [
        {fraction: .5, widthFraction: .94, bottomMetres: .08, heightMetres: .86, color: '#81584e', outsetMetres: .18},
        {fraction: .06, widthFraction: .06, bottomMetres: .8, heightMetres: 1.82, color: '#81584e', outsetMetres: .18},
        {fraction: .94, widthFraction: .06, bottomMetres: .8, heightMetres: 1.82, color: '#81584e', outsetMetres: .18},
        {fraction: .5, widthFraction: .98, bottomMetres: 2.6, heightMetres: .24, color: '#58605d', outsetMetres: .3},
      ],
    },
  },
  'way/1002680782': {
    street: 'Reid Street', intersection: 'Reid Street / Edinburgh Street', corner: 'northwest',
    photoIds: ['R077'], source: 'dense/flat-768/frame_0110_lens0_pitch+0.jpg',
    observation: 'The northwest Edinburgh bungalow has muted tan walls, a broad shallow dark roof, a pale-framed window group and a rough gray-brown lower entry wall. Shrubs partly hide the north end.',
    estimated: 'One broad window group and the entrance cue are bounded estimates; the partly obscured north end gains no extra windows. The lower wall is represented by a simple color band, not claimed as exact stonework. Existing roof shape/height and yard remain unchanged.',
    profile: {
      label: 'REID-EDINBURGH-NW', name: 'Tan bungalow at Edinburgh', confidence: 'observed',
      frontLatLon: [{lat: 44.3132339, lon: -78.3285525}, {lat: 44.3131668, lon: -78.3285482}],
      style: 'house', levels: 1, windowColumns: 1, detailHeightMetres: 3.2,
    },
    appearance: {
      wallColor: '#b6aa94', wallSurface: 'render', roofColor: '#4d514a', trimColor: '#d7d8ca', glassColor: '#4e6462',
      porch: false, skipGroundWindows: true,
      plinthColor: '#8b8273', plinthHeight: .86,
      groundWindows: [{t: .63, bottom: .95, width: 2.4, height: 1.38}],
      entryDoor: {fraction: .2, widthMetres: .94, heightMetres: 2.16, color: '#c4c8b9'},
    },
  },
  'way/1005415712': {
    street: 'Reid Street', intersection: 'Reid Street / Edinburgh Street', corner: 'southeast',
    photoIds: ['R078'], source: 'dense/flat-768/frame_0110_lens1_pitch+0.jpg',
    observation: 'Across Edinburgh from Jiffy Lube, a raised red-brick house has pale upper trim, a pale enclosed/screened porch and a gray base. Trees obscure much of the front. The complex footprint includes a visibly lower south return.',
    estimated: 'Only the main mapped west edge receives restrained opening/porch-panel cues. Upper-window visibility, porch subdivision, colors and dimensions are estimated. The enclosed porch is not replaced by a generic open porch. No massing zones, full-ring gable or new upper windows are applied to the lower south return; its existing source geometry remains unchanged.',
    profile: {
      label: 'REID-EDINBURGH-SE', name: 'Raised brick house at Edinburgh', confidence: 'observed',
      frontLatLon: [{lat: 44.3130103, lon: -78.3281834}, {lat: 44.3129525, lon: -78.3281821}],
      style: 'house', levels: 2, windowColumns: 2, detailHeightMetres: 5.9,
    },
    appearance: {
      wallColor: '#875749', wallSurface: 'brick', roofColor: '#494d44', trimColor: '#d9cfba', glassColor: '#46554f',
      porch: false, entryDoor: null, skipGroundWindows: true, windowWidthMetres: .8, windowHeightMetres: 1.4,
      windowOverrides: [{level: 1, column: 0, skip: true}],
      plinthColor: '#817f74', plinthHeight: .68,
      groundWindows: [{t: .27, bottom: .92, width: 1.02, height: 1.36}, {t: .51, bottom: .92, width: 1.02, height: 1.36}, {t: .75, bottom: .92, width: 1.02, height: 1.36}],
      facadePanels: [
        {fraction: .5, widthFraction: .94, bottomMetres: .66, heightMetres: .16, color: '#c9c6b4', outsetMetres: .3},
        {fraction: .5, widthFraction: .94, bottomMetres: 2.4, heightMetres: .16, color: '#c9c6b4', outsetMetres: .3},
      ],
    },
  },
  'way/1002680800': {
    street: 'Reid Street', intersection: 'Reid Street / Dublin Street approach',
    photoIds: ['R083'], source: 'dense/flat-768/frame_0118_lens0_pitch+0.jpg',
    observation: 'The west-side duplex just north of Dublin has red brick, two narrow upper sashes, a broad low dark porch roof with pale posts, two separate pale doors and a lower dark sash. Its shallow dark roof appears hip-like in the photo.',
    estimated: 'Two opaque pale door panels deliberately replace the single default entry. Widths, door/window fractions, porch depth/posts and colors are estimates; no door animation or collision opening is implied. Existing source roof geometry is retained, and the photo is not treated as a surveyed roof plan.',
    profile: {
      label: 'REID-DUBLIN-DUPLEX', name: 'Red duplex north of Dublin', confidence: 'observed',
      frontLatLon: [{lat: 44.3120235, lon: -78.3286140}, {lat: 44.3119450, lon: -78.3286090}],
      style: 'house', levels: 2, windowColumns: 2, detailHeightMetres: 5.75,
    },
    appearance: {
      wallColor: '#8a5549', wallSurface: 'brick', roofColor: '#4d5550', trimColor: '#d3c9b5', glassColor: '#414c47',
      entryDoor: null, skipGroundWindows: true, windowWidthMetres: .78, windowHeightMetres: 1.47,
      doorFraction: .5, porchWidthFraction: .98, porchDepthMetres: .8, porchHeightMetres: 2.6, porchRoofColor: '#47554e',
      groundWindows: [{t: .5, bottom: .65, width: 1.03, height: 1.48}],
      facadePanels: [
        {fraction: .22, widthFraction: .12, bottomMetres: .08, heightMetres: 2.16, color: '#e2dac7', outsetMetres: .27},
        {fraction: .78, widthFraction: .12, bottomMetres: .08, heightMetres: 2.16, color: '#e2dac7', outsetMetres: .27},
      ],
    },
  },
};
