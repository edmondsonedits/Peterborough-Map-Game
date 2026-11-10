// Seven reviewed Water/Hunter facade deltas. Existing source profiles supply the
// wall/roof dimensions and exact footprint. Openings, bay dimensions and colors
// are visual estimates from owner photographs; no collision or roof edits.
const nordiaBlueCorner = {
  blankFacade: true, glazedLevels: [], verticalGlazing: null, entryDoor: null, signText: null,
  glassColor: '#487789', trimColor: '#355963', windowColumns: 3,
  groundWindows: [
    {t: .2, bottom: 3.5, width: 1.65, height: 15.2},
    {t: .5, bottom: 3.5, width: 1.65, height: 15.2},
    {t: .8, bottom: 3.5, width: 1.65, height: 15.2},
  ],
  facadePanels: [
    {fraction: .5, widthFraction: .9, bottomMetres: .35, heightMetres: 2.6, color: '#28383e', outsetMetres: .3},
    {fraction: .5, widthFraction: .9, bottomMetres: 6.9, heightMetres: .38, color: '#355963', outsetMetres: .3},
    {fraction: .5, widthFraction: .9, bottomMetres: 10.9, heightMetres: .38, color: '#355963', outsetMetres: .3},
    {fraction: .5, widthFraction: .9, bottomMetres: 14.9, heightMetres: .38, color: '#355963', outsetMetres: .3},
  ],
};

export const ROUTE_WATER_APPEARANCES = {
  'way/1006243552': {
    street: 'Water Street', photoIds: ['R228'], source: 'sherbrooke-water-hunter/perspective-2048/0732s_lens0_pitch+0.jpg',
    observation: 'The west-facing two-storey brick row has six narrow upper sash. The central shop has a blue fascia and a full-height lime surround around its large window and recessed door. A dark shop is south/right, and a red-and-white shop is north/left.',
    estimated: 'Sash dimensions, shop fractions, colors and entrance recess are visual estimates. The lime unit spans approximately t=.37–.72 on this south-to-north edge. No uncertain business name is added. Existing 7.1 m source wall, flat roof and footprint remain unchanged; the three lower fields are bounded shop approximations.',
    camera: {lat: 44.3051161, lon: -78.3188765, bearingDegrees: 87.7, roadId: 'way/454960676', reviewMode: 'cab-seat', status: 'Mapped centerline; actual cab visibility and collision still require CI review.'},
    appearance: {
      wallColor: '#965f4f', wallSurface: 'brick', trimColor: '#353b37', glassColor: '#52645e',
      style: 'office', windowColumns: 6, windowWidthMetres: .83, windowHeightMetres: 1.65,
      skipGroundWindows: true, signText: null, signBusinessName: null,
      groundWindows: [
        {t: .15, bottom: .45, width: 2.8, height: 2.15},
        {t: .59, bottom: .45, width: 2.35, height: 2.15},
        {t: .855, bottom: .45, width: 2.4, height: 2.15},
      ],
      entryDoor: {fraction: .42, widthMetres: .9, heightMetres: 2.45, color: '#a5b72c'},
      facadePanels: [
        {fraction: .17, widthFraction: .34, bottomMetres: .1, heightMetres: 3.0, color: '#303a38', outsetMetres: .16},
        {fraction: .545, widthFraction: .36, bottomMetres: .08, heightMetres: 2.95, color: '#a5b72c', outsetMetres: .16},
        {fraction: .545, widthFraction: .36, bottomMetres: 2.75, heightMetres: .6, color: '#315a79', outsetMetres: .3},
        {fraction: .855, widthFraction: .25, bottomMetres: .1, heightMetres: 3.0, color: '#95524d', outsetMetres: .16},
        {fraction: .855, widthFraction: .25, bottomMetres: 2.75, heightMetres: .48, color: '#ddd7bd', outsetMetres: .3},
      ],
    },
  },
  'way/1006243558': {
    street: 'Water Street', photoIds: ['R231', 'R233'], source: 'dense/flat-768/frame_0367_lens1_pitch+0.jpg',
    observation: 'The southern cream facade has three storeys, two flat sash columns on the south/left and a stacked enclosed polygonal bay on the north/right. A continuous cream projected spandrel joins the bay tiers. Warm golden-brown cornice caps the facade. The ground has framed shop windows and a central red door with arched transom; no open balcony or exposed railing is visible.',
    estimated: 'Bay position, 2.25 m width, .55 m projection, .58 front-width fraction and all opening dimensions/colors are visual estimates. Three closed bay faces and a solid connecting spandrel approximate the photographed enclosure, not surveyed geometry. The ground transom arch and small trim are omitted. Existing 9.4 m wall, roof and collision are retained.',
    camera: {lat: 44.3052097, lon: -78.3188818, bearingDegrees: 267.7, roadId: 'way/454960676', reviewMode: 'cab-seat', status: 'Mapped centerline; actual cab visibility and collision still require CI review.'},
    appearance: {
      name: 'Southern cream enclosed-bay frontage on Water', notes: 'R231/R233 show enclosed stacked bays, not the previously inferred open balconies. Source massing is retained.',
      wallColor: '#d4c9ae', wallSurface: 'render', trimColor: '#d0c7b2', glassColor: '#687976',
      blankFacade: true, glazedLevels: [], balconyLevels: [], features: [], signText: null,
      plinthColor: '#655e52', plinthHeight: .5,
      groundWindows: [
        {t: .15, bottom: 3.85, width: .82, height: 1.5}, {t: .34, bottom: 3.85, width: .82, height: 1.5},
        {t: .15, bottom: 7.15, width: .82, height: 1.35}, {t: .34, bottom: 7.15, width: .82, height: 1.35},
        {t: .22, bottom: .65, width: 2.0, height: 1.8}, {t: .76, bottom: .65, width: 2.05, height: 1.8},
      ],
      entryDoor: {fraction: .5, widthMetres: .9, heightMetres: 2.35, color: '#9b2d31'},
      enclosedBays: [
        {fraction: .78, widthMetres: 2.25, bottomMetres: 3.15, heightMetres: 2.55, depthMetres: .55, frontWidthFraction: .58, baseHeightMetres: .42, capHeightMetres: .12, wallColor: '#d4c9ae', trimColor: '#a68d66', glassColor: '#687976', joinToNext: true},
        {fraction: .78, widthMetres: 2.25, bottomMetres: 6.25, heightMetres: 2.55, depthMetres: .55, frontWidthFraction: .58, baseHeightMetres: .42, capHeightMetres: .12, wallColor: '#d4c9ae', trimColor: '#a68d66', glassColor: '#687976'},
      ],
      facadePanels: [
        {fraction: .5, widthFraction: .96, bottomMetres: .1, heightMetres: 2.8, color: '#3d443f', outsetMetres: .16},
        {fraction: .04, widthFraction: .06, bottomMetres: .1, heightMetres: 2.95, color: '#c8bca1', outsetMetres: .3},
        {fraction: .435, widthFraction: .03, bottomMetres: .1, heightMetres: 2.95, color: '#c8bca1', outsetMetres: .3},
        {fraction: .565, widthFraction: .03, bottomMetres: .1, heightMetres: 2.95, color: '#c8bca1', outsetMetres: .3},
        {fraction: .96, widthFraction: .06, bottomMetres: .1, heightMetres: 2.95, color: '#c8bca1', outsetMetres: .3},
        {fraction: .5, widthFraction: .99, bottomMetres: 2.95, heightMetres: .18, color: '#a58b60', outsetMetres: .32},
        {fraction: .5, widthFraction: .99, bottomMetres: 8.95, heightMetres: .25, color: '#a58b60', outsetMetres: .32},
      ],
    },
  },
  'way/1006243559': {
    street: 'Water Street', photoIds: ['R231', 'R233'], source: 'flat-priority-2048/0735s_lens1_pitch+0_up15.jpg',
    observation: 'The next north facade is also cream and three storeys, with two flat sash columns left/south and one stacked enclosed bay right/north. Its nearly black storefront has broad dark fields, a central recessed entry and a pale mottled base. The red brick building starts beyond this parcel to the north.',
    estimated: 'The cream treatment corrects the previous brick assignment. Bay dimensions, color, storefront subdivisions and all opening positions are estimates from oblique photos. Solid enclosed faces and a connected projected spandrel replace no source mass. The narrow south boundary passage is not recast as a guessed entrance. Existing 9.7 m wall and roof remain unchanged.',
    camera: {lat: 44.3052866, lon: -78.3188861, bearingDegrees: 267.7, roadId: 'way/454960676', reviewMode: 'cab-seat', status: 'Mapped centerline; actual cab visibility and collision still require CI review.'},
    appearance: {
      name: 'Northern cream enclosed-bay frontage on Water', notes: 'R231/R233 place the second cream facade here; the neighboring brick facade is farther north. Existing source massing is retained.',
      wallColor: '#d4c9ae', wallSurface: 'render', trimColor: '#b6ad96', glassColor: '#596761',
      blankFacade: true, glazedLevels: [], balconyLevels: [], features: [], signText: null,
      plinthColor: '#b5ad98', plinthHeight: .55,
      groundWindows: [
        {t: .10, bottom: 4.0, width: .82, height: 1.5}, {t: .32, bottom: 4.0, width: .82, height: 1.5},
        {t: .10, bottom: 7.45, width: .82, height: 1.35}, {t: .32, bottom: 7.45, width: .82, height: 1.35},
        {t: .24, bottom: .7, width: 2.6, height: 1.85}, {t: .78, bottom: .7, width: 2.3, height: 1.85},
      ],
      entryDoor: {fraction: .52, widthMetres: .95, heightMetres: 2.45, color: '#252e2b'},
      enclosedBays: [
        {fraction: .78, widthMetres: 2.25, bottomMetres: 3.25, heightMetres: 2.55, depthMetres: .55, frontWidthFraction: .58, baseHeightMetres: .42, capHeightMetres: .12, wallColor: '#d4c9ae', trimColor: '#a68d66', glassColor: '#687976', joinToNext: true},
        {fraction: .78, widthMetres: 2.25, bottomMetres: 6.55, heightMetres: 2.55, depthMetres: .55, frontWidthFraction: .58, baseHeightMetres: .42, capHeightMetres: .12, wallColor: '#d4c9ae', trimColor: '#a68d66', glassColor: '#687976'},
      ],
      facadePanels: [
        {fraction: .5, widthFraction: .98, bottomMetres: .3, heightMetres: 2.8, color: '#252e2b', outsetMetres: .16},
        {fraction: .5, widthFraction: .99, bottomMetres: 3.0, heightMetres: .22, color: '#252e2b', outsetMetres: .3},
        {fraction: .5, widthFraction: .99, bottomMetres: 9.25, heightMetres: .25, color: '#a58b60', outsetMetres: .32},
      ],
    },
  },
  'way/1006243553': {
    street: 'Water Street', photoIds: ['R232'], source: 'flat-priority-2048/0735s_lens0_pitch+0_up15.jpg',
    observation: 'The west-facing three-storey brick block has six rounded arches on its top tier and six rectangular middle sash, paired between pale vertical masonry strips beneath a heavy bracketed cornice. Ground shops have separate dark fields and doors. The southern ground glazing reads EAST CITY KNIFE CO.',
    estimated: 'Six-column spacing, pale strip widths, glass fields and all metric dimensions/colors are visual estimates. Three conservative lower fields avoid inventing six shop entrances. The EAST CITY KNIFE CO lettering is directly observed on glass but is not reproduced as an opaque board. Existing 10 m wall, flat roof and source footprint remain unchanged.',
    camera: {lat: 44.3052323, lon: -78.3188831, bearingDegrees: 87.7, roadId: 'way/454960676', reviewMode: 'cab-seat', status: 'Mapped centerline; actual cab visibility and collision still require CI review.'},
    appearance: {
      wallColor: '#a36b54', wallSurface: 'brick', trimColor: '#454b40', glassColor: '#708582',
      style: 'office', windowColumns: 6, windowWidthMetres: 1.22, windowHeightMetres: 1.85,
      archedWindowLevels: [2], skipGroundWindows: true, entryDoor: null, signText: null,
      features: ['corbelled-cornice'], corniceColor: '#c1ac80',
      groundWindows: [{t: .16, bottom: .6, width: 3.2, height: 2.25}, {t: .5, bottom: .6, width: 3.2, height: 2.25}, {t: .84, bottom: .6, width: 3.2, height: 2.25}],
      facadePanels: [
        {fraction: .5, widthFraction: .99, bottomMetres: .12, heightMetres: 3.1, color: '#3d3d34', outsetMetres: .16},
        {fraction: .018, widthFraction: .025, bottomMetres: 3.4, heightMetres: 6.2, color: '#c1ac80', outsetMetres: .3},
        {fraction: .333, widthFraction: .03, bottomMetres: 3.4, heightMetres: 6.2, color: '#c1ac80', outsetMetres: .3},
        {fraction: .667, widthFraction: .03, bottomMetres: 3.4, heightMetres: 6.2, color: '#c1ac80', outsetMetres: .3},
        {fraction: .982, widthFraction: .025, bottomMetres: 3.4, heightMetres: 6.2, color: '#c1ac80', outsetMetres: .3},
      ],
    },
  },
  'way/1006243555': {
    street: 'Water Street', intersection: 'Water Street / Hunter Street', photoIds: ['R235', 'R236', 'R238', 'R242'], source: 'dense/flat-768/frame_0372_lens0_pitch+0.jpg',
    observation: 'Scotiabank has broad divided green-grey glazing in pale stone. R235/R236 show six broad upper glass groups plus a narrow terminal field before the red vertical tower at the south/right end of its west-facing Water return. White Scotiabank letters are applied to stone near the north/left corner. The Hunter side has pale stone, grouped glazing and a separate glassier eastern portion.',
    estimated: 'Window groups, stone piers, tower width, dimensions and lettering proportions are visual estimates. The Water edge runs north to south, so its red panel is at high t. Its top remains below the existing 7.6 m wall ceiling; the taller physical tower silhouette is not reconstructed. Applied white text uses a transparent plane with no invented opaque plaque. Existing Hunter geometry/glazing and all massing remain unchanged; the old red-on-pale Hunter signboard is removed.',
    camera: {lat: 44.3057337, lon: -78.3189114, bearingDegrees: 87.7, roadId: 'way/454960676', reviewMode: 'cab-seat', status: 'Mapped centerline; actual cab visibility and collision still require CI review.'},
    appearance: {
      wallColor: '#bbb8a9', wallSurface: 'stone', trimColor: '#bbbeb0', glassColor: '#647b76',
      signText: null, signBusinessName: 'Scotiabank',
      additionalFrontages: [{
        label: 'Water face', frontLatLon: [{lat: 44.3058618, lon: -78.3187806}, {lat: 44.3056137, lon: -78.3187638}],
        blankFacade: true, glazedLevels: [], entryDoor: null, windowColumns: 5,
        groundWindows: [
          {t: .105, bottom: .8, width: 3.3, height: 2.35}, {t: .265, bottom: .8, width: 3.3, height: 2.35},
          {t: .425, bottom: .8, width: 3.3, height: 2.35}, {t: .585, bottom: .8, width: 3.3, height: 2.35},
          {t: .745, bottom: .8, width: 3.3, height: 2.35},
          {t: .07, bottom: 4.65, width: 3.0, height: 1.85}, {t: .205, bottom: 4.65, width: 3.0, height: 1.85},
          {t: .34, bottom: 4.65, width: 3.0, height: 1.85}, {t: .475, bottom: 4.65, width: 3.0, height: 1.85},
          {t: .61, bottom: 4.65, width: 3.0, height: 1.85}, {t: .745, bottom: 4.65, width: 3.0, height: 1.85},
          {t: .813, bottom: 4.65, width: .4, height: 1.85},
        ],
        facadePanels: [{fraction: .91, widthFraction: .18, bottomMetres: .45, heightMetres: 7.0, color: '#bc2634', outsetMetres: .3}],
        signText: 'Scotiabank', signBusinessName: 'Scotiabank', signStyle: 'applied', signFont: '700 46px Arial,sans-serif',
        signTextColor: '#f3f1e8', signFraction: .25, signWidthMetres: 7.4, signHeightMetres: 3.9, signBoardHeightMetres: .65, signOutsetMetres: .4,
      }],
    },
  },
  'way/1006243541': {
    street: 'Hunter Street', photoIds: ['R248'], source: 'dense/flat-768/frame_0385_lens0_pitch+0.jpg',
    observation: 'The north-facing one-storey brick Smiles to You storefront has one broad window, a dark door at its west/right end, a substantial blank brick area to the east/left, and a single dark fascia. The word you is turquoise in the photographed name.',
    estimated: 'Window/door fractions, dimensions, brick color and fascia height are visual estimates. The supported sign is plain pale lettering on the actual dark fascia; the turquoise final word and temporary window poster are omitted. There are no repeated shop awnings or invented eastern glass fields. Existing 3.9 m wall, flat roof and footprint remain unchanged.',
    camera: {lat: 44.3060233, lon: -78.3172751, bearingDegrees: 175.8, roadId: 'way/499202158', reviewMode: 'cab-seat', status: 'Mapped centerline; actual cab visibility and collision still require CI review.'},
    appearance: {
      name: 'Smiles to You Hunter storefront', wallColor: '#9a5f50', wallSurface: 'brick', trimColor: '#272e2b', glassColor: '#48544e',
      style: 'office', blankFacade: true, features: [],
      groundWindows: [{t: .45, bottom: .65, width: 2.5, height: 1.85}],
      entryDoor: {fraction: .12, widthMetres: 1.0, heightMetres: 2.45, color: '#272e2b'},
      facadePanels: [{fraction: .5, widthFraction: .99, bottomMetres: 3.1, heightMetres: .68, color: '#222a27', outsetMetres: .3}],
      signText: 'smiles to you', signBusinessName: 'Smiles to You', signFont: '600 46px Arial,sans-serif',
      signFraction: .35, signWidthMetres: 4.9, signHeightMetres: 3.44, signBoardHeightMetres: .58,
      signBoardColor: '#222a27', signBackgroundColor: '#222a27', signTextColor: '#eeeae0', signOutsetMetres: .42,
    },
  },
  'way/1031042883': {
    street: 'Water Street / Simcoe Street', photoIds: ['R219', 'R221', 'R222', 'R225', 'R228'], source: 'sherbrooke-water-hunter/perspective-2048/0714s_lens0_pitch+0.jpg',
    observation: '364 Water has five wall tiers on both main street faces: a dark ground lobby, a broad first-upper glass band and three thin upper ribbon rows. R221/R222/R225 put blue curtain glazing at the southwest corner; R228 shows no blue bay beside the lime shop at the north end of Water. The blue glazing occupies both short adjacent southwest faces, with dark ground lobby below.',
    estimated: 'Blue field widths, color, mullion dimensions, pier widths and glass heights are visual estimates. The four fronts are exact adjacent source edges, preserving the existing 20 m wall, footprint, roof and collision. The southwest curtain is a flat facade approximation on the mapped corner, without a guessed projection or overhang. Its lower lobby is a dark field; recessed doors, ramp and angled lobby glazing are not reconstructed. The temporary sale board and unmeasured Nordia logo are omitted.',
    camera: {lat: 44.3049672, lon: -78.318868, bearingDegrees: 87.7, roadId: 'way/454960676', reviewMode: 'cab-seat', status: 'Mapped centerline; actual cab visibility and collision still require CI review.'},
    additionalCameras: [
      {face: 1, lat: 44.3048422, lon: -78.318861, bearingDegrees: 87.7, roadId: 'way/454960676'},
      {face: 2, lat: 44.3047338, lon: -78.3186786, bearingDegrees: 355.2, roadId: 'way/33951205'},
      {face: 3, lat: 44.3047452, lon: -78.3184884, bearingDegrees: 355.2, roadId: 'way/33951205'},
    ],
    appearance: {
      name: '364 Water southwest corner office', notes: 'R221/R222/R225/R228 correct the street directions: blue curtain wraps the two southwest short faces, not the north end of the main Water face. Source massing remains unchanged.',
      wallColor: '#b9ae96', wallSurface: 'stone', trimColor: '#626c68', glassColor: '#485b5b',
      glazedLevels: [0, 1, 2, 3, 4], glazedLevelHeights: {0: 2.8, 1: 2.4, 2: .7, 3: .7, 4: .7},
      verticalGlazing: null, entryDoor: null, signText: null,
      facadePanels: [{fraction: .08, widthFraction: .16, bottomMetres: 0, heightMetres: 20, color: '#b9ae96', outsetMetres: .3}],
      additionalFrontages: [
        {...nordiaBlueCorner, label: 'Southwest Water short face', frontLatLon: [{lat: 44.3048169, lon: -78.3187263}, {lat: 44.3048752, lon: -78.3187296}]},
        {...nordiaBlueCorner, label: 'Southwest Simcoe short face', frontLatLon: [{lat: 44.3048169, lon: -78.3187263}, {lat: 44.3048196, lon: -78.3186508}]},
        {label: 'Simcoe main face', frontLatLon: [{lat: 44.3048196, lon: -78.3186508}, {lat: 44.3048305, lon: -78.3183448}],
          facadePanels: [{fraction: .08, widthFraction: .16, bottomMetres: 0, heightMetres: 20, color: '#b9ae96', outsetMetres: .3}]},
      ],
    },
  },
};
