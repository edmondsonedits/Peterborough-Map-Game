// Eight facade-only records verified against R137–R190 and adjacent current OSM
// vertices. Metric dimensions/colors are visual estimates. Source massing, roofs,
// yards and collision remain authoritative; game-view approval is still pending.
export const ROUTE_SHERBROOKE_APPEARANCES = {
  'way/1006594206': {
    street: 'Sherbrooke Street', intersection: 'Sherbrooke Street / Rubidge Street', corner: 'northwest',
    photoIds: ['R137'], source: 'dense/flat-768/frame_0195_lens1_pitch+0.jpg',
    observation: 'The south-facing pale masonry wall has three narrow upper sash. Tall dark storefront glass and pale piers occupy its eastern two-thirds below a black DOMINION LENDING fascia. The west ground wall is mostly blank.',
    estimated: 'Opening centers, dimensions and colors are visual estimates. The cropped end of the sign is not completed. Storefront panes stop before the blank west wall; no unseen entrance is added. The existing mapped 6.82184 m wall and roof geometry remain unchanged.',
    profile: {
      label: 'SHER-DOMINION', name: 'Dominion frontage at Rubidge', confidence: 'observed',
      frontLatLon: [{lat: 44.3005673, lon: -78.3267573}, {lat: 44.3005774, lon: -78.3265354}],
      style: 'office', levels: 2, windowColumns: 3, detailHeightMetres: 6.75,
    },
    appearance: {
      wallColor: '#cbc9bd', wallSurface: 'render', trimColor: '#393c37', glassColor: '#344340',
      blankFacade: true, entryDoor: null,
      groundWindows: [
        {t: .27, bottom: 4.55, width: 1.03, height: 1.6},
        {t: .45, bottom: 4.55, width: 1.03, height: 1.6},
        {t: .66, bottom: 4.55, width: 1.03, height: 1.6},
        {t: .43, bottom: .45, width: 2.6, height: 2.75},
        {t: .66, bottom: .45, width: 2.95, height: 2.75},
        {t: .875, bottom: .45, width: 2.5, height: 2.75},
      ],
      facadePanels: [
        {fraction: .67, widthFraction: .65, bottomMetres: 3.42, heightMetres: .5, color: '#242a28', outsetMetres: .28},
        {fraction: .5, widthFraction: .99, bottomMetres: 6.52, heightMetres: .16, color: '#3d443c', outsetMetres: .28},
      ],
      signText: 'DOMINION LENDING', signBusinessName: 'Dominion Lending', signFont: '700 46px Arial,sans-serif',
      signFraction: .67, signWidthMetres: 9.6, signHeightMetres: 3.67, signBoardHeightMetres: .46,
      signBoardColor: '#242a28', signBackgroundColor: '#242a28', signTextColor: '#e6e5dc', signOutsetMetres: .4,
    },
  },
  'way/1006575786': {
    street: 'Sherbrooke Street', intersection: 'Sherbrooke Street / Rubidge Street', corner: 'southeast',
    photoIds: ['R138'], source: 'dense/flat-768/frame_0197_lens0_pitch+0.jpg',
    observation: 'Grey horizontal siding has three upper sash. The west shop bay has a pale surround, red LAUNDROMAT fascia, large window and a shadowed door at its west end. A separate pale door is at the east end; photo right is map west.',
    estimated: 'Dimensions, fractions, colors and shallow shop-bay projection are estimates. Painted render approximates siding color without claiming individual boards. The east door is a pale panel, with no extra collision opening. Small schedule lettering is omitted; source height and roof remain unchanged.',
    profile: {
      label: 'SHER-LAUNDROMAT', name: 'Laundromat at Rubidge', confidence: 'observed',
      frontLatLon: [{lat: 44.3004242, lon: -78.3263008}, {lat: 44.3004312, lon: -78.3261648}],
      style: 'office', levels: 2, windowColumns: 3, detailHeightMetres: 6.4,
    },
    appearance: {
      wallColor: '#8b9390', wallSurface: 'render', trimColor: '#343d37', glassColor: '#424f48',
      blankFacade: true,
      groundWindows: [
        {t: .22, bottom: 4.1, width: .82, height: 1.5},
        {t: .48, bottom: 4.1, width: .82, height: 1.5},
        {t: .74, bottom: 4.1, width: .82, height: 1.5},
        {t: .27, bottom: .6, width: 2.05, height: 1.65},
      ],
      entryDoor: {fraction: .065, widthMetres: .8, heightMetres: 2.55, color: '#3b4038'},
      facadePanels: [
        {fraction: .28, widthFraction: .56, bottomMetres: .15, heightMetres: 2.63, color: '#c9c8b6', outsetMetres: .16},
        {fraction: .28, widthFraction: .56, bottomMetres: 2.96, heightMetres: .55, color: '#9a3d53', outsetMetres: .3},
        {fraction: .88, widthFraction: .10, bottomMetres: .1, heightMetres: 2.3, color: '#e1dfd0', outsetMetres: .27},
        {fraction: .5, widthFraction: .99, bottomMetres: 6.15, heightMetres: .17, color: '#414b43', outsetMetres: .28},
      ],
      signText: 'LAUNDROMAT', signBusinessName: 'Laundromat', signFont: '700 46px Arial,sans-serif',
      signFraction: .28, signWidthMetres: 5.4, signHeightMetres: 3.235, signBoardHeightMetres: .5,
      signBoardColor: '#9a3d53', signBackgroundColor: '#9a3d53', signTextColor: '#ebe5d4', signOutsetMetres: .42,
    },
  },
  'way/1006575766': {
    street: 'Sherbrooke Street', intersection: 'Sherbrooke Street / Stewart Street', corner: 'southwest',
    photoIds: ['R141'], source: 'dense/flat-768/frame_0200_lens0_pitch+0.jpg',
    observation: 'The north-facing side wall is pale painted masonry with a dark green eave and exactly two white-framed upper windows. The ground wall is blank. A lower side/rear addition and black fence are visible to the west.',
    estimated: 'Upper-window dimensions/elevations and colors are estimates bounded by the actual 4.24778 m mapped wall. The two observed side-wall windows gain no guessed ground openings, porch or entrance. Lower rear geometry and roof remain unchanged.',
    profile: {
      label: 'SHER-STEWART-SW', name: 'Pale sidewall southwest of Stewart', confidence: 'observed',
      frontLatLon: [{lat: 44.3004602, lon: -78.325474}, {lat: 44.3004643, lon: -78.3253949}],
      style: 'house', levels: 2, windowColumns: 2, detailHeightMetres: 4.24,
    },
    appearance: {
      wallColor: '#d1cbb7', wallSurface: 'render', trimColor: '#e2e3d4', glassColor: '#677974',
      blankFacade: true, porch: false, entryDoor: null,
      groundWindows: [{t: .30, bottom: 2.56, width: .84, height: 1.2}, {t: .70, bottom: 2.56, width: .84, height: 1.2}],
      facadePanels: [{fraction: .5, widthFraction: .99, bottomMetres: 4.0, heightMetres: .16, color: '#344d3c', outsetMetres: .28}],
    },
  },
  'way/1006594188': {
    street: 'Sherbrooke Street', intersection: 'Sherbrooke Street / Stewart Street', corner: 'northwest',
    photoIds: ['R142'], source: 'dense/flat-768/frame_0200_lens1_pitch+0.jpg',
    observation: 'The south gable-end wall has pale grey horizontal siding, two larger lower windows, two upper windows and a tiny fifth opening just west of the central warm-grey chimney. There is no street-facing door.',
    estimated: 'Opening sizes, elevations, chimney width and colors are visual estimates within the actual 5.75801 m mapped wall. Render approximates the siding color. The narrow vertical panel is a chimney-face cue; the projecting chimney, exact gable and all roof work remain deferred.',
    profile: {
      label: 'SHER-STEWART-NW', name: 'Pale gable-end house northwest of Stewart', confidence: 'observed',
      frontLatLon: [{lat: 44.3006282, lon: -78.3256001}, {lat: 44.3006358, lon: -78.3254326}],
      style: 'house', levels: 2, windowColumns: 2, detailHeightMetres: 5.7,
    },
    appearance: {
      wallColor: '#bbbdb6', wallSurface: 'render', trimColor: '#e1e3d6', glassColor: '#61706c',
      blankFacade: true, porch: false, entryDoor: null,
      groundWindows: [
        {t: .24, bottom: .55, width: 1.12, height: 1.65}, {t: .73, bottom: .55, width: 1.12, height: 1.65},
        {t: .24, bottom: 3.5, width: .97, height: 1.35}, {t: .73, bottom: 3.5, width: .97, height: 1.35},
        {t: .41, bottom: 4.12, width: .48, height: .55},
      ],
      facadePanels: [{fraction: .52, widthFraction: .055, bottomMetres: .04, heightMetres: 5.61, color: '#9b9689', outsetMetres: .35}],
    },
  },
  'way/1006575767': {
    street: 'Sherbrooke Street', intersection: 'Sherbrooke Street / Stewart Street', corner: 'southeast',
    photoIds: ['R143', 'R144'], source: 'dense/flat-768/frame_0201_lens0_pitch+0.jpg',
    observation: 'The corner red-brick house has one principal wall storey with two shallow-arched windows flanking a central door, a dark hip roof, one small dormer and a garden setback. R144 repeats this corner at photo right.',
    estimated: 'Window/door dimensions, colors and fractions are estimates. Two supported arched window shapes flank a rectangular entry; the exact arched door head is omitted. The currently taller 6.34727 m mapped wall and gabled roof are retained as known massing mismatches. No second window tier, dormer, roof or yard change is introduced.',
    profile: {
      label: 'SHER-STEWART-SE', name: 'Low brick house southeast of Stewart', confidence: 'observed',
      frontLatLon: [{lat: 44.3004521, lon: -78.3251287}, {lat: 44.3004595, lon: -78.3249834}],
      style: 'house', levels: 1, windowColumns: 3, detailHeightMetres: 3.35,
    },
    appearance: {
      wallColor: '#925e50', wallSurface: 'brick', trimColor: '#b9ad92', glassColor: '#46534b', porch: false,
      windowOverrides: [
        {level: 0, column: 0, shape: 'arch', widthMetres: 1.15, heightMetres: 1.8, bottomMetres: .7},
        {level: 0, column: 2, shape: 'arch', widthMetres: 1.15, heightMetres: 1.8, bottomMetres: .7},
      ],
      entryDoor: {fraction: .5, widthMetres: 1.02, heightMetres: 2.55, color: '#686552'},
    },
  },
  'way/1006594168': {
    street: 'Sherbrooke Street', intersection: 'Sherbrooke Street / Aylmer Street approach',
    photoIds: ['R157', 'R158'], source: 'dense/flat-768/frame_0222_lens1_pitch+0.jpg',
    observation: 'Thrive Health stands west of the immediate northwest Aylmer corner, with open parking on both sides. Its south end has two tall glass fields separated by a broad grey pier, fine dark mullions, white THRIVE HEALTH / PTBO lettering on the glass, and green tree-shaped lower screening.',
    estimated: 'Glazing dimensions, mullion divisions, pier width and colors are estimated within the actual 4.22003 m mapped wall. Plain green fields approximate the lower screening; exact tree silhouettes and transparent lettering need a dedicated asset. No opaque sign plaque is added. Existing roof geometry and both parking gaps remain unchanged.',
    profile: {
      label: 'SHER-THRIVE', name: 'Thrive Health west of Aylmer', confidence: 'observed',
      frontLatLon: [{lat: 44.3007347, lon: -78.3237849}, {lat: 44.3007443, lon: -78.3236052}],
      style: 'office', levels: 1, windowColumns: 6, detailHeightMetres: 4.15,
    },
    appearance: {
      wallColor: '#92958d', wallSurface: 'render', trimColor: '#343d38', glassColor: '#51656a',
      largeGlazedFront: true, entryDoor: null, signText: null, signBusinessName: 'Thrive Health',
      facadePanels: [
        {fraction: .5, widthFraction: .06, bottomMetres: .15, heightMetres: 3.85, color: '#92958d', outsetMetres: .32},
        {fraction: .025, widthFraction: .04, bottomMetres: .15, heightMetres: 3.85, color: '#92958d', outsetMetres: .32},
        {fraction: .975, widthFraction: .04, bottomMetres: .15, heightMetres: 3.85, color: '#92958d', outsetMetres: .32},
        {fraction: .5, widthFraction: .99, bottomMetres: 3.95, heightMetres: .18, color: '#92958d', outsetMetres: .32},
        {fraction: .2625, widthFraction: .405, bottomMetres: .21, heightMetres: 1.25, color: '#25834b', outsetMetres: .26},
        {fraction: .7375, widthFraction: .405, bottomMetres: .21, heightMetres: 1.25, color: '#25834b', outsetMetres: .26},
      ],
    },
  },
  'way/1006575755': {
    street: 'Sherbrooke Street', intersection: 'Sherbrooke Street / Aylmer Street', corner: 'southwest',
    photoIds: ['R159', 'R161', 'R162', 'R164'], source: 'dense/flat-768/frame_0228_lens0_pitch+0.jpg',
    observation: 'The red-brick north end has two tall upper arched dark openings, pale sills/keystones and two substantial rectangular glass-block fields below. A grey stone/concrete base and flat parapet are visible. No front entry is visible.',
    estimated: 'Opening dimensions, elevations, colors and keystone fractions are estimates. Lower fields are approximately 1.9 m wide by 1.95 m tall, not small sash. Fine glass-block divisions and exact arch masonry remain simplified. A thin face band suggests the parapet; mapped wall/roof geometry is unchanged.',
    profile: {
      label: 'SHER-AYLMER-SW', name: 'Arched brick block southwest of Aylmer', confidence: 'observed',
      frontLatLon: [{lat: 44.3005471, lon: -78.3233108}, {lat: 44.3005534, lon: -78.3231628}],
      style: 'office', levels: 2, windowColumns: 2, detailHeightMetres: 6.35,
    },
    appearance: {
      wallColor: '#975b50', wallSurface: 'brick', trimColor: '#b8af96', glassColor: '#424c47',
      skipGroundWindows: true, entryDoor: null, plinthColor: '#929389', plinthHeight: .65,
      windowOverrides: [
        {level: 1, column: 0, shape: 'arch', widthMetres: 1.65, heightMetres: 1.85, bottomMetres: 3.75},
        {level: 1, column: 1, shape: 'arch', widthMetres: 1.65, heightMetres: 1.85, bottomMetres: 3.75},
      ],
      groundWindows: [{t: .25, bottom: .78, width: 1.9, height: 1.95}, {t: .75, bottom: .78, width: 1.9, height: 1.95}],
      facadePanels: [
        {fraction: .25, widthFraction: .025, bottomMetres: 5.62, heightMetres: .27, color: '#c2bca8', outsetMetres: .3},
        {fraction: .75, widthFraction: .025, bottomMetres: 5.62, heightMetres: .27, color: '#c2bca8', outsetMetres: .3},
        {fraction: .5, widthFraction: .99, bottomMetres: 6.1, heightMetres: .16, color: '#6c574d', outsetMetres: .3},
      ],
    },
  },
  'way/755554888': {
    street: 'Sherbrooke Street', intersection: 'Sherbrooke Street / George Street approach',
    photoIds: ['R190'], source: 'dense/flat-768/frame_0294_lens0_pitch+0.jpg',
    observation: 'East of the existing yellow No Frills sign facade, a separate recessed north-facing return has a broad dark loading aperture, pale corrugated fascia and pale side piers. A high concrete retaining edge crosses the foreground.',
    estimated: 'Aperture dimensions, fascia height, recess depth and colors are estimates against the existing 5.2 m reviewed wall. The dark field is surface appearance, not a drive-through opening. Corrugations, foreground retaining-wall geometry and unseen loading interior remain deferred. Existing west sign, photo badge, massing and collision are retained.',
    // This extends an existing source profile. It deliberately has no standalone
    // profile that could replace the reviewed western edge or its photograph.
    appearance: {
      additionalFrontages: [{
        frontLatLon: [{lat: 44.3006452, lon: -78.3191107}, {lat: 44.3006562, lon: -78.3188414}],
        style: 'office', levels: 1, detailHeightMetres: 5.2, blankFacade: true,
        trimColor: '#d2d2c6', entryDoor: null, signText: null, signBusinessName: null, groundWindows: [],
        facadePanels: [
          {fraction: .5, widthFraction: .9, bottomMetres: .65, heightMetres: 2.65, color: '#1a2020', outsetMetres: .18},
          {fraction: .5, widthFraction: .99, bottomMetres: 3.35, heightMetres: 1.6, color: '#d2d2c6', outsetMetres: .24},
          {fraction: .025, widthFraction: .05, bottomMetres: .3, heightMetres: 3.05, color: '#d2d2c6', outsetMetres: .24},
          {fraction: .975, widthFraction: .05, bottomMetres: .3, heightMetres: 3.05, color: '#d2d2c6', outsetMetres: .24},
        ],
      }],
    },
  },
};
