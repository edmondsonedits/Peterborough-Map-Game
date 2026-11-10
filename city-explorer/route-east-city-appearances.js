// Twelve verified East City source buildings, R262–R298. Exact adjacent mapped
// frontages are retained; numeric appearance values and QA camera poses are
// estimates. This registry changes no source footprint, roof, height or collision.
// Source-photo directions follow the turn on Driscoll and reversal on Cricket.
export const ROUTE_EAST_CITY_APPEARANCES = {
  "way/1015118634": {
    sourceId: "way/1015118634",
    street: "Hunter Street East",
    photoIds: ["R262", "R271"],
    source: "dense/flat-768/frame_0408_lens1_pitch+0.jpg",
    sourcePhotoCameras: [
      {photoId: "R262", timestamp: "13:36.816", lens: 1, pitchDegrees: 0, viewDirection: "north/NNW", source: "dense/flat-768/frame_0408_lens1_pitch+0.jpg"},
      {photoId: "R271", timestamp: "14:00.840", lens: 1, pitchDegrees: 0, viewDirection: "west/WSW", source: "dense/flat-768/frame_0420_lens1_pitch+0.jpg"}
    ],
    sourceMatch: {
      parcelIds: [8791],
      municipalBuildingIds: [23437],
      status: "Ordered photo continuity, current ring and municipal parcel/building association; no photographic GPS or surveyed facade dimensions."
    },
    observation: "Six narrow dark vertical glazing strips between broad pale masonry piers on the Hunter face. Broad dark-framed glazed zone at the east end and projecting entry beyond it. Low flat roof silhouette; a higher red-toned mass is visible behind. R271 shows the long east return, not a second building.",
    estimated: "Colors, glazing widths/heights and fractions are visual estimates fitted below the actual 6.517 m source wall. Six narrow slots and the broad east-end glass are represented by bounded panes. No exact entrance location or unreadable wordmark is invented. The current inferred gabled roof and uniform height conflict with the photographed low flat silhouette/higher rear mass and require separate geometry review; they are not changed here.",
    camera: {
      lat: 44.305813456667735,
      lon: -78.31231559726204,
      bearingDegrees: 340.537,
      roadId: "way/33953339",
      frontageIndex: 0,
      eyeAboveSampledRoadMetres: 2.1,
      targetAboveSampledBuildingBaseMetres: 2.5,
      reviewMode: "cab-seat",
      status: "Estimated review pose on the mapped road centerline, not a recovered recording position; sample terrain and verify visibility at runtime."
    },
    profile: {
      label: "EAST-KAWARTHA",
      name: "Kawartha building on Hunter Street East",
      confidence: "observed",
      frontLatLon: [
        {lat: 44.3059973, lon: -78.312611},
        {lat: 44.3060814, lon: -78.3122433}
      ],
      style: "office",
      levels: 1,
      windowColumns: 1,
      detailHeightMetres: 6.4
    },
    appearance: {
      wallColor: "#c7c4b3",
      wallSurface: "render",
      roofColor: "#65665e",
      trimColor: "#3c4643",
      glassColor: "#3c5555",
      blankFacade: true,
      porch: false,
      entryDoor: null,
      signText: null,
      skipGroundWindows: true,
      features: [],
      groundWindows: [
        {t: 0.08, bottom: 0.22, width: 0.78, height: 5.65},
        {t: 0.215, bottom: 0.22, width: 0.78, height: 5.65},
        {t: 0.35, bottom: 0.22, width: 0.78, height: 5.65},
        {t: 0.485, bottom: 0.22, width: 0.78, height: 5.65},
        {t: 0.62, bottom: 0.22, width: 0.78, height: 5.65},
        {t: 0.755, bottom: 0.22, width: 0.78, height: 5.65},
        {t: 0.91, bottom: 0.22, width: 4.65, height: 5.65}
      ],
      facadePanels: [
        {fraction: 0.5, widthFraction: 0.99, bottomMetres: 6.02, heightMetres: 0.22, color: "#b4b7ae", outsetMetres: 0.2}
      ]
    }
  },
  "way/755554027": {
    sourceId: "way/755554027",
    street: "Driscoll Terrace",
    photoIds: ["R265", "R267", "R269"],
    source: "sherbrooke-water-hunter/perspective-2048/0828s_lens0_pitch+0.jpg",
    sourcePhotoCameras: [
      {photoId: "R265", timestamp: "13:48.000", lens: 0, pitchDegrees: 0, viewDirection: "east/ENE", source: "sherbrooke-water-hunter/perspective-2048/0828s_lens0_pitch+0.jpg"},
      {photoId: "R267", timestamp: "13:48.828", lens: 0, pitchDegrees: 0, viewDirection: "east/ENE", source: "dense/flat-768/frame_0414_lens0_pitch+0.jpg"},
      {photoId: "R269", timestamp: "13:54.834", lens: 0, pitchDegrees: 0, viewDirection: "east/ENE", source: "dense/flat-768/frame_0417_lens0_pitch+0.jpg"}
    ],
    sourceMatch: {
      parcelIds: [8793],
      municipalBuildingIds: [23103],
      status: "Ordered photo continuity, current ring and municipal parcel/building association; no photographic GPS or surveyed facade dimensions."
    },
    observation: "Long lower west wing has tan walls, pale blue-gray metal eave and green-gray subdivided ribbon glazing. The south part of the lower wing has solid tan wall with sparse small openings; it is not glazed uniformly end to end. A taller projecting north block has one broad high horizontal window and a navy door under a dark canopy, toward the north portion of its west face.",
    estimated: "All colors, pane subdivisions, dimensions and fractions are estimates. The long lower wing receives a northern ribbon and sparse southern openings, not continuous glass. Only the projecting north-block west edge receives the high horizontal window and an opaque navy door panel under a canopy. The 3.2/5.1 m limits control decoration only; the existing uniform 5.169 m wall/gabled source mass does not reproduce the photographed stepped flat heights and is flagged for separate geometry review.",
    camera: {
      lat: 44.30627139964086,
      lon: -78.31169717116182,
      bearingDegrees: 72.002,
      roadId: "way/33965578",
      frontageIndex: 0,
      eyeAboveSampledRoadMetres: 2.1,
      targetAboveSampledBuildingBaseMetres: 2.5,
      reviewMode: "cab-seat",
      status: "Estimated review pose on the mapped road centerline, not a recovered recording position; sample terrain and verify visibility at runtime."
    },
    additionalCameras: [
      {
        lat: 44.306467757408086,
        lon: -78.31178633039072,
        bearingDegrees: 71.974,
        roadId: "way/33965578",
        frontageIndex: 1,
        eyeAboveSampledRoadMetres: 2.1,
        targetAboveSampledBuildingBaseMetres: 2.5,
        reviewMode: "cab-seat",
        status: "Estimated review pose on the mapped road centerline, not a recovered recording position; sample terrain and verify visibility at runtime."
      }
    ],
    profile: {
      label: "EAST-DRISCOLL",
      name: "Tan building on Driscoll Terrace",
      confidence: "observed",
      frontLatLon: [
        {lat: 44.3061924, lon: -78.3113152},
        {lat: 44.3064962, lon: -78.311452}
      ],
      style: "office",
      levels: 1,
      windowColumns: 1,
      detailHeightMetres: 3.2
    },
    appearance: {
      wallColor: "#b8aa88",
      wallSurface: "render",
      roofColor: "#8c9796",
      trimColor: "#acb5b0",
      glassColor: "#78908a",
      blankFacade: true,
      porch: false,
      entryDoor: null,
      signText: null,
      skipGroundWindows: true,
      features: [],
      groundWindows: [
        {t: 0.12, bottom: 1.05, width: 0.82, height: 1.15},
        {t: 0.25, bottom: 1.05, width: 0.82, height: 1.15},
        {t: 0.36, bottom: 1.05, width: 0.82, height: 1.15},
        {t: 0.47, bottom: 0.78, width: 2.7, height: 1.58},
        {t: 0.57, bottom: 0.78, width: 2.7, height: 1.58},
        {t: 0.67, bottom: 0.78, width: 2.7, height: 1.58},
        {t: 0.77, bottom: 0.78, width: 2.7, height: 1.58},
        {t: 0.87, bottom: 0.78, width: 2.7, height: 1.58},
        {t: 0.96, bottom: 0.78, width: 2.7, height: 1.58}
      ],
      facadePanels: [
        {fraction: 0.5, widthFraction: 0.99, bottomMetres: 2.72, heightMetres: 0.33, color: "#9caeaf", outsetMetres: 0.24}
      ],
      additionalFrontages: [
        {
          frontLatLon: [
            {lat: 44.3064837, lon: -78.3115063},
            {lat: 44.3065729, lon: -78.3115464}
          ],
          detailHeightMetres: 5.1,
          levels: 2,
          windowColumns: 1,
          blankFacade: true,
          porch: false,
          entryDoor: null,
          trimColor: "#58615c",
          groundWindows: [
            {t: 0.69, bottom: 3.52, width: 3.7, height: 0.96}
          ],
          facadePanels: [
            {fraction: 0.78, widthFraction: 0.112, bottomMetres: 0.08, heightMetres: 2.12, color: "#2e4057", outsetMetres: 0.27}
          ],
          entryCanopy: {fraction: 0.78, widthMetres: 2.1, heightMetres: 2.52, depthMetres: 0.72}
        }
      ]
    }
  },
  "way/755554019": {
    sourceId: "way/755554019",
    street: "Hunter Street East",
    photoIds: ["R264", "R263"],
    source: "dense/flat-768/frame_0411_lens0_pitch+0.jpg",
    sourcePhotoCameras: [
      {photoId: "R264", timestamp: "13:42.822", lens: 0, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0411_lens0_pitch+0.jpg"},
      {photoId: "R263", timestamp: "13:40.820", lens: 0, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0410_lens0_pitch+0.jpg"}
    ],
    sourceMatch: {
      parcelIds: [22697],
      municipalBuildingIds: [32543],
      status: "Ordered photo continuity, current ring and municipal parcel/building association; no photographic GPS or surveyed facade dimensions."
    },
    observation: "Red-brown brick/glazed storefront under broad pale blue-gray metal fascia. A raised pale entry portal is toward the west half of the short Hunter-facing wall. Circle K name/logo is directly legible in R264; Shell canopy is a separate mapped object west of the store.",
    estimated: "The CIRCLE K name is readable in R264; other lettering is omitted. Colors, storefront divisions, portal fraction and all dimensions are estimates. The pale portal and blue-gray fascia are bounded to the current 2.60 m source wall; the real raised portal silhouette and taller storefront need separate massing review. The generic retail fascia is suppressed so it cannot cross the pale portal. The separate Shell canopy, parking and roadside pylon are untouched.",
    camera: {
      lat: 44.306006216094104,
      lon: -78.31145848474303,
      bearingDegrees: 161.894,
      roadId: "way/33939069",
      frontageIndex: 0,
      eyeAboveSampledRoadMetres: 2.1,
      targetAboveSampledBuildingBaseMetres: 2.5,
      reviewMode: "cab-seat",
      status: "Estimated review pose on the mapped road centerline, not a recovered recording position; sample terrain and verify visibility at runtime."
    },
    profile: {
      label: "EAST-CIRCLE-K",
      name: "Circle K on Hunter Street East",
      confidence: "observed",
      frontLatLon: [
        {lat: 44.3058945, lon: -78.3113204},
        {lat: 44.3058593, lon: -78.3114784}
      ],
      style: "office",
      levels: 1,
      windowColumns: 1,
      detailHeightMetres: 2.6
    },
    appearance: {
      wallColor: "#915e50",
      wallSurface: "brick",
      roofColor: "#7e8f92",
      trimColor: "#9baeb0",
      glassColor: "#48605c",
      blankFacade: true,
      porch: false,
      entryDoor: {fraction: 0.68, widthMetres: 1.1, heightMetres: 1.96, color: "#e5e5d7"},
      signText: "CIRCLE K",
      skipGroundWindows: true,
      features: [],
      groundWindows: [
        {t: 0.1, bottom: 0.12, width: 1.65, height: 1.73},
        {t: 0.28, bottom: 0.12, width: 1.65, height: 1.73},
        {t: 0.45, bottom: 0.12, width: 1.65, height: 1.73},
        {t: 0.89, bottom: 0.12, width: 1.25, height: 1.73}
      ],
      facadePanels: [
        {fraction: 0.5, widthFraction: 0.99, bottomMetres: 2.06, heightMetres: 0.45, color: "#82999f", outsetMetres: 0.2},
        {fraction: 0.68, widthFraction: 0.205, bottomMetres: 0.02, heightMetres: 2.53, color: "#dce0d4", outsetMetres: 0.24}
      ],
      signBusinessName: "Circle K",
      signFont: "700 46px Arial,sans-serif",
      signFraction: 0.68,
      signWidthMetres: 1.6,
      signHeightMetres: 2.25,
      signBoardHeightMetres: 0.3,
      signBoardColor: "#a9373c",
      signBackgroundColor: "#a9373c",
      signTextColor: "#f4f0df",
      signOutsetMetres: 0.4
    }
  },
  "way/1015118609": {
    sourceId: "way/1015118609",
    street: "Cricket Place",
    intersection: "Cricket Place / Driscoll Terrace",
    corner: "southeast",
    photoIds: ["R270", "R272", "R298"],
    source: "dense/flat-768/frame_0468_lens1_pitch+0.jpg",
    sourcePhotoCameras: [
      {photoId: "R270", timestamp: "14:00.840", lens: 0, pitchDegrees: 0, viewDirection: "east/ENE", source: "dense/flat-768/frame_0420_lens0_pitch+0.jpg"},
      {photoId: "R272", timestamp: "14:04.844", lens: 0, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0422_lens0_pitch+0.jpg"},
      {photoId: "R298", timestamp: "15:36.936", lens: 1, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0468_lens1_pitch+0.jpg"}
    ],
    sourceMatch: {
      parcelIds: [21330],
      municipalBuildingIds: [20211],
      status: "Ordered photo continuity, current ring and municipal parcel/building association; no photographic GPS or surveyed facade dimensions."
    },
    observation: "Broad pale/taupe two-storey north face under a shallow dark hip roof, with four upper pale-framed sashes (outer ones partly screened). Deep dark continuous porch canopy, partly obscured lower frontage, low lawn and tall columnar evergreens at the corners. West return in R270 has one vertically aligned pair of windows toward its south portion; no broad front porch pattern belongs on that wall.",
    estimated: "Four upper north-face sashes and the single aligned west-return pair are directly visible; their sizes, fractions, porch depth/posts and colors are estimates. Ground openings on the main front are obscured and are omitted. The west return gets no front porch. Existing low rear-return geometry and inferred whole-ring roof are retained for a separate massing review; no trees or yard elements are added.",
    camera: {
      lat: 44.30702202826866,
      lon: -78.3118482722131,
      bearingDegrees: 162.35,
      roadId: "way/33960427",
      frontageIndex: 0,
      eyeAboveSampledRoadMetres: 2.1,
      targetAboveSampledBuildingBaseMetres: 2.5,
      reviewMode: "cab-seat",
      status: "Estimated review pose on the mapped road centerline, not a recovered recording position; sample terrain and verify visibility at runtime."
    },
    additionalCameras: [
      {
        lat: 44.30682198768867,
        lon: -78.31194823962772,
        bearingDegrees: 73.146,
        roadId: "way/33965578",
        frontageIndex: 1,
        eyeAboveSampledRoadMetres: 2.1,
        targetAboveSampledBuildingBaseMetres: 2.5,
        reviewMode: "cab-seat",
        status: "Estimated review pose on the mapped road centerline, not a recovered recording position; sample terrain and verify visibility at runtime."
      }
    ],
    profile: {
      label: "EAST-CRICKET-SE",
      name: "Pale house at Cricket and Driscoll",
      confidence: "observed",
      frontLatLon: [
        {lat: 44.3068842, lon: -78.3118751},
        {lat: 44.3069218, lon: -78.3117156}
      ],
      style: "house",
      levels: 2,
      windowColumns: 1,
      detailHeightMetres: 5.9
    },
    appearance: {
      wallColor: "#a79d8c",
      wallSurface: "render",
      roofColor: "#555b54",
      trimColor: "#d8d9c8",
      glassColor: "#657472",
      blankFacade: true,
      porch: true,
      entryDoor: null,
      signText: null,
      skipGroundWindows: true,
      features: [],
      doorFraction: 0.5,
      porchWidthFraction: 0.98,
      porchDepthMetres: 0.8,
      porchHeightMetres: 2.68,
      porchRoofColor: "#3c443c",
      groundWindows: [
        {t: 0.12, bottom: 3.62, width: 0.9, height: 1.58},
        {t: 0.37, bottom: 3.62, width: 0.9, height: 1.58},
        {t: 0.63, bottom: 3.62, width: 0.9, height: 1.58},
        {t: 0.88, bottom: 3.62, width: 0.9, height: 1.58}
      ],
      additionalFrontages: [
        {
          frontLatLon: [
            {lat: 44.3067999, lon: -78.3118363},
            {lat: 44.3068842, lon: -78.3118751}
          ],
          porch: false,
          entryDoor: null,
          groundWindows: [
            {t: 0.2, bottom: 0.85, width: 0.95, height: 1.55},
            {t: 0.2, bottom: 3.62, width: 0.9, height: 1.58}
          ],
          facadePanels: []
        }
      ]
    }
  },
  "way/1015118646": {
    sourceId: "way/1015118646",
    street: "Cricket Place",
    intersection: "Cricket Place / Driscoll Terrace",
    corner: "northeast",
    photoIds: ["R273", "R297", "R299"],
    source: "dense/flat-768/frame_0424_lens1_pitch+0.jpg",
    sourcePhotoCameras: [
      {photoId: "R273", timestamp: "14:08.848", lens: 1, pitchDegrees: 0, viewDirection: "north/NNW", source: "dense/flat-768/frame_0424_lens1_pitch+0.jpg"},
      {photoId: "R297", timestamp: "15:36.936", lens: 0, pitchDegrees: 0, viewDirection: "north/NNW", source: "dense/flat-768/frame_0468_lens0_pitch+0.jpg"},
      {photoId: "R299", timestamp: "15:44.010", lens: 0, pitchDegrees: 0, viewDirection: "north/NNW", source: "dense/flat-768/frame_0472_lens0_pitch+0.jpg"}
    ],
    sourceMatch: {
      parcelIds: [6502],
      municipalBuildingIds: [30063],
      status: "Ordered photo continuity, current ring and municipal parcel/building association; no photographic GPS or surveyed facade dimensions."
    },
    observation: "Broad mostly blank red-brick south side wall with a shallow dark eave. One dark-trimmed upper sash and a vertically aligned lower opening are near the east end. No entrance or porch is visible on this exposed Cricket wall; the home faces Driscoll on its west side.",
    estimated: "One aligned upper/lower pair near the east end is visible; colors, pane dimensions, eave strip and fractions are estimated. The large western wall stays blank, with no Cricket-facing door or porch. The Driscoll-facing front and actual shallow roof form are outside this wall-only treatment.",
    camera: {
      lat: 44.30701578472078,
      lon: -78.31187569341715,
      bearingDegrees: 342.35,
      roadId: "way/33960427",
      frontageIndex: 0,
      eyeAboveSampledRoadMetres: 2.1,
      targetAboveSampledBuildingBaseMetres: 2.5,
      reviewMode: "cab-seat",
      status: "Estimated review pose on the mapped road centerline, not a recovered recording position; sample terrain and verify visibility at runtime."
    },
    profile: {
      label: "EAST-CRICKET-NE",
      name: "Red side wall at Cricket and Driscoll",
      confidence: "observed",
      frontLatLon: [
        {lat: 44.3070955, lon: -78.3119798},
        {lat: 44.3071248, lon: -78.3118555}
      ],
      style: "house",
      levels: 2,
      windowColumns: 1,
      detailHeightMetres: 5.1
    },
    appearance: {
      wallColor: "#9e594b",
      wallSurface: "brick",
      roofColor: "#4b5147",
      trimColor: "#6c7066",
      glassColor: "#4f6462",
      blankFacade: true,
      porch: false,
      entryDoor: null,
      signText: null,
      skipGroundWindows: true,
      features: [],
      groundWindows: [
        {t: 0.77, bottom: 0.65, width: 0.83, height: 1.43},
        {t: 0.77, bottom: 3.18, width: 0.83, height: 1.43}
      ],
      facadePanels: [
        {fraction: 0.5, widthFraction: 0.99, bottomMetres: 4.88, heightMetres: 0.16, color: "#4b5147", outsetMetres: 0.27}
      ]
    }
  },
  "way/1015118647": {
    sourceId: "way/1015118647",
    street: "Cricket Place",
    photoIds: ["R275", "R276", "R278", "R295"],
    source: "dense/flat-768/frame_0426_lens1_pitch+0.jpg",
    sourcePhotoCameras: [
      {photoId: "R275", timestamp: "14:12.852", lens: 1, pitchDegrees: 0, viewDirection: "north/NNW", source: "dense/flat-768/frame_0426_lens1_pitch+0.jpg"},
      {photoId: "R276", timestamp: "14:18.858", lens: 1, pitchDegrees: 0, viewDirection: "north/NNW", source: "dense/flat-768/frame_0429_lens1_pitch+0.jpg"},
      {photoId: "R278", timestamp: "14:20.860", lens: 1, pitchDegrees: 0, viewDirection: "north/NNW", source: "dense/flat-768/frame_0430_lens1_pitch+0.jpg"},
      {photoId: "R295", timestamp: "15:24.924", lens: 0, pitchDegrees: 0, viewDirection: "north/NNW", source: "dense/flat-768/frame_0462_lens0_pitch+0.jpg"}
    ],
    sourceMatch: {
      parcelIds: [4380],
      municipalBuildingIds: [8829],
      status: "Ordered photo continuity, current ring and municipal parcel/building association; no photographic GPS or surveyed facade dimensions."
    },
    observation: "Red brick lower/main floors, broad pale front gable with three small attic panes. Two tall upper sashes and a broad projecting porch canopy with pale trim/posts. It is the first full north-side house after the driveway east of the blank corner wall.",
    estimated: "Colors, main-floor sash dimensions, porch depth/posts and fractions are estimates within the current 4.684 m source wall. The photographed white triangular gable and three attic panes are not flattened onto the main wall or used to alter the roof. Ground openings behind porch vegetation remain omitted; no default central door is added.",
    camera: {
      lat: 44.307099552071385,
      lon: -78.31150779336134,
      bearingDegrees: 342.35,
      roadId: "way/33960427",
      frontageIndex: 0,
      eyeAboveSampledRoadMetres: 2.1,
      targetAboveSampledBuildingBaseMetres: 2.5,
      reviewMode: "cab-seat",
      status: "Estimated review pose on the mapped road centerline, not a recovered recording position; sample terrain and verify visibility at runtime."
    },
    profile: {
      label: "EAST-CRICKET-14",
      name: "Red house with white gable, north Cricket",
      confidence: "observed",
      frontLatLon: [
        {lat: 44.3072269, lon: -78.3116186},
        {lat: 44.30725, lon: -78.3115205}
      ],
      style: "house",
      levels: 2,
      windowColumns: 1,
      detailHeightMetres: 4.65
    },
    appearance: {
      wallColor: "#94594d",
      wallSurface: "brick",
      roofColor: "#626b60",
      trimColor: "#e1e0cf",
      glassColor: "#6c7b72",
      blankFacade: true,
      porch: true,
      entryDoor: null,
      signText: null,
      skipGroundWindows: true,
      features: [],
      porchWidthFraction: 0.98,
      porchDepthMetres: 0.8,
      porchHeightMetres: 2.35,
      porchRoofColor: "#626c62",
      groundWindows: [
        {t: 0.28, bottom: 2.9, width: 0.87, height: 1.32},
        {t: 0.72, bottom: 2.9, width: 0.87, height: 1.32}
      ]
    }
  },
  "way/1015118648": {
    sourceId: "way/1015118648",
    street: "Cricket Place",
    photoIds: ["R276", "R278", "R295"],
    source: "dense/flat-768/frame_0429_lens1_pitch+0.jpg",
    sourcePhotoCameras: [
      {photoId: "R276", timestamp: "14:18.858", lens: 1, pitchDegrees: 0, viewDirection: "north/NNW", source: "dense/flat-768/frame_0429_lens1_pitch+0.jpg"},
      {photoId: "R278", timestamp: "14:20.860", lens: 1, pitchDegrees: 0, viewDirection: "north/NNW", source: "dense/flat-768/frame_0430_lens1_pitch+0.jpg"},
      {photoId: "R295", timestamp: "15:24.924", lens: 0, pitchDegrees: 0, viewDirection: "north/NNW", source: "dense/flat-768/frame_0462_lens0_pitch+0.jpg"}
    ],
    sourceMatch: {
      parcelIds: [4381],
      municipalBuildingIds: [6424],
      status: "Ordered photo continuity, current ring and municipal parcel/building association; no photographic GPS or surveyed facade dimensions."
    },
    observation: "Red brick two-storey house with shallow gray-green hip roof. Two pale upper sash groups and a deep porch with pale posts. It follows the white-gable14 and precedes the narrow pale-gable22 in the actual west-to-east row.",
    estimated: "Two upper sash groups and the broad pale-post porch are visible. Colors, sash dimensions and porch dimensions/fractions are estimates; shutter and frame subdivisions are simplified. The source currently infers a gable although the photograph shows a shallow hip, and its 7.071 m wall is not re-scaled here. This is not the green-gabled house south of Cricket. Ground entry remains hidden and is omitted.",
    camera: {
      lat: 44.30712263485252,
      lon: -78.31140641548077,
      bearingDegrees: 342.35,
      roadId: "way/33960427",
      frontageIndex: 0,
      eyeAboveSampledRoadMetres: 2.1,
      targetAboveSampledBuildingBaseMetres: 2.5,
      reviewMode: "cab-seat",
      status: "Estimated review pose on the mapped road centerline, not a recovered recording position; sample terrain and verify visibility at runtime."
    },
    profile: {
      label: "EAST-CRICKET-16",
      name: "Red hip-roof house, north Cricket",
      confidence: "observed",
      frontLatLon: [
        {lat: 44.3072711, lon: -78.3115232},
        {lat: 44.3072928, lon: -78.3114313}
      ],
      style: "house",
      levels: 2,
      windowColumns: 1,
      detailHeightMetres: 5.8
    },
    appearance: {
      wallColor: "#925b4b",
      wallSurface: "brick",
      roofColor: "#5d695b",
      trimColor: "#dfdeca",
      glassColor: "#61746a",
      blankFacade: true,
      porch: true,
      entryDoor: null,
      signText: null,
      skipGroundWindows: true,
      features: [],
      porchWidthFraction: 0.97,
      porchDepthMetres: 0.85,
      porchHeightMetres: 2.6,
      porchRoofColor: "#6c7564",
      groundWindows: [
        {t: 0.28, bottom: 3.38, width: 0.94, height: 1.48},
        {t: 0.72, bottom: 3.38, width: 0.94, height: 1.48}
      ]
    }
  },
  "way/1015118656": {
    sourceId: "way/1015118656",
    street: "Cricket Place",
    photoIds: ["R274", "R298"],
    source: "dense/flat-768/frame_0426_lens0_pitch+0.jpg",
    sourcePhotoCameras: [
      {photoId: "R274", timestamp: "14:12.852", lens: 0, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0426_lens0_pitch+0.jpg"},
      {photoId: "R298", timestamp: "15:36.936", lens: 1, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0468_lens1_pitch+0.jpg"}
    ],
    sourceMatch: {
      parcelIds: [4378],
      municipalBuildingIds: [11067],
      status: "Ordered photo continuity, current ring and municipal parcel/building association; no photographic GPS or surveyed facade dimensions."
    },
    observation: "Taupe/light brown masonry, shallow dark hip roof and two tall pale upper sashes. Small gray shallow entrance canopy; purple-leaved tree obscures much of the lower frontage. First full narrow south-side house east of the broad corner house.",
    estimated: "Two upper pale sashes and a small entry canopy are visible. Colors, opening sizes, canopy fraction and dimensions are estimates. The dark tree obscures the entrance and much of the ground floor, so no doorway or extra ground windows are invented. There is no full-width default porch. Existing source hip roof and massing remain unchanged.",
    camera: {
      lat: 44.30707005217125,
      lon: -78.31163735475764,
      bearingDegrees: 162.35,
      roadId: "way/33960427",
      frontageIndex: 0,
      eyeAboveSampledRoadMetres: 2.1,
      targetAboveSampledBuildingBaseMetres: 2.5,
      reviewMode: "cab-seat",
      status: "Estimated review pose on the mapped road centerline, not a recovered recording position; sample terrain and verify visibility at runtime."
    },
    profile: {
      label: "EAST-CRICKET-9",
      name: "Taupe hip-roof house, south Cricket",
      confidence: "observed",
      frontLatLon: [
        {lat: 44.3069424, lon: -78.3116291},
        {lat: 44.3069631, lon: -78.3115413}
      ],
      style: "house",
      levels: 2,
      windowColumns: 1,
      detailHeightMetres: 5.7
    },
    appearance: {
      wallColor: "#a79a87",
      wallSurface: "render",
      roofColor: "#59605a",
      trimColor: "#d9dacc",
      glassColor: "#63726c",
      blankFacade: true,
      porch: false,
      entryDoor: null,
      signText: null,
      skipGroundWindows: true,
      features: [],
      groundWindows: [
        {t: 0.29, bottom: 3.45, width: 0.9, height: 1.42},
        {t: 0.71, bottom: 3.45, width: 0.9, height: 1.42}
      ],
      entryCanopy: {fraction: 0.77, widthMetres: 1.55, heightMetres: 2.48, depthMetres: 0.55}
    }
  },
  "way/1015118657": {
    sourceId: "way/1015118657",
    street: "Cricket Place",
    photoIds: ["R274", "R296"],
    source: "dense/flat-768/frame_0462_lens1_pitch+0.jpg",
    sourcePhotoCameras: [
      {photoId: "R274", timestamp: "14:12.852", lens: 0, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0426_lens0_pitch+0.jpg"},
      {photoId: "R296", timestamp: "15:24.924", lens: 1, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0462_lens1_pitch+0.jpg"}
    ],
    sourceMatch: {
      parcelIds: [4379],
      municipalBuildingIds: [9367],
      status: "Ordered photo continuity, current ring and municipal parcel/building association; no photographic GPS or surveyed facade dimensions."
    },
    observation: "Light brick house with shallow hip roof, two upper windows and broad pale shutters. Nearly full-width dark porch canopy, pale posts/rail and vehicles partly blocking the lower front.",
    estimated: "Colors and shallow porch/post dimensions are estimates. The selected exact ring edge is the outer porch projection: only porch cues are placed there. The two observed upper windows and broad white shutters belong to a recessed upper plane and are deliberately omitted from this edge pending a separate geometry review. No hidden ground doorway, additional projection volume, roof change or garden is authored.",
    camera: {
      lat: 44.30710257920012,
      lon: -78.31149449843413,
      bearingDegrees: 162.35,
      roadId: "way/33960427",
      frontageIndex: 0,
      eyeAboveSampledRoadMetres: 2.1,
      targetAboveSampledBuildingBaseMetres: 2.5,
      reviewMode: "cab-seat",
      status: "Estimated review pose on the mapped road centerline, not a recovered recording position; sample terrain and verify visibility at runtime."
    },
    profile: {
      label: "EAST-CRICKET-13",
      name: "Pale shuttered house porch, south Cricket",
      confidence: "observed",
      frontLatLon: [
        {lat: 44.3069854, lon: -78.3114867},
        {lat: 44.3070043, lon: -78.3114065}
      ],
      style: "house",
      levels: 2,
      windowColumns: 1,
      detailHeightMetres: 5.8
    },
    appearance: {
      wallColor: "#b9b0a0",
      wallSurface: "render",
      roofColor: "#67706a",
      trimColor: "#e0dfd1",
      glassColor: "#647870",
      blankFacade: true,
      porch: true,
      entryDoor: null,
      signText: null,
      skipGroundWindows: true,
      features: [],
      porchWidthFraction: 0.96,
      porchDepthMetres: 0.35,
      porchHeightMetres: 2.58,
      porchRoofColor: "#505b52",
      groundWindows: []
    }
  },
  "way/1015118659": {
    sourceId: "way/1015118659",
    street: "Cricket Place",
    photoIds: ["R296", "R277", "R294"],
    source: "dense/flat-768/frame_0462_lens1_pitch+0.jpg",
    sourcePhotoCameras: [
      {photoId: "R296", timestamp: "15:24.924", lens: 1, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0462_lens1_pitch+0.jpg"},
      {photoId: "R277", timestamp: "14:20.860", lens: 0, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0430_lens0_pitch+0.jpg"},
      {photoId: "R294", timestamp: "15:16.916", lens: 1, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0458_lens1_pitch+0.jpg"}
    ],
    sourceMatch: {
      parcelIds: [4382],
      municipalBuildingIds: [8868],
      status: "Ordered photo continuity, current ring and municipal parcel/building association; no photographic GPS or surveyed facade dimensions."
    },
    observation: "Red-brick body, white/pale front gable and projecting dark upper balcony. Brown slatted privacy panel at the west side of the upper balcony; pale lower porch columns/rail. A mature tree obscures the eastern part of the front.",
    estimated: "Dark balcony rail/deck strips, the west-side brown privacy screen and pale lower-porch posts are represented by bounded shallow panels; colors, widths, heights, fractions and railing subdivisions are estimates. These do not reconstruct a surveyed projecting balcony or exact slat texture. The current renderer shares one trim palette between generic upper/lower porches, so its automatic balcony is disabled to avoid a second or wrongly colored railing. Only the visible eastern upper sash is retained; hidden doors, the white gable and attic pane remain deferred.",
    camera: {
      lat: 44.3071365081718,
      lon: -78.3113454848807,
      bearingDegrees: 162.35,
      roadId: "way/33960427",
      frontageIndex: 0,
      eyeAboveSampledRoadMetres: 2.1,
      targetAboveSampledBuildingBaseMetres: 2.5,
      reviewMode: "cab-seat",
      status: "Estimated review pose on the mapped road centerline, not a recovered recording position; sample terrain and verify visibility at runtime."
    },
    profile: {
      label: "EAST-CRICKET-17",
      name: "Upper-balcony house, south Cricket",
      confidence: "observed",
      frontLatLon: [
        {lat: 44.3070104, lon: -78.3113394},
        {lat: 44.3070317, lon: -78.3112489}
      ],
      style: "house",
      levels: 2,
      windowColumns: 1,
      detailHeightMetres: 5.7
    },
    appearance: {
      wallColor: "#955c4c",
      wallSurface: "brick",
      roofColor: "#6a746a",
      trimColor: "#dad8ca",
      glassColor: "#5b6f66",
      blankFacade: true,
      porch: true,
      entryDoor: null,
      signText: null,
      skipGroundWindows: true,
      features: [],
      porchWidthFraction: 0.94,
      porchDepthMetres: 0.7,
      porchHeightMetres: 2.7,
      porchRoofColor: "#424b40",
      groundWindows: [
        {t: 0.72, bottom: 3.35, width: 0.9, height: 1.4}
      ],
      balconyLevels: [],
      facadePanels: [
        {fraction: 0.5, widthFraction: 0.94, bottomMetres: 2.9, heightMetres: 0.12, color: "#3d433a", outsetMetres: 0.59},
        {fraction: 0.5, widthFraction: 0.94, bottomMetres: 3.9, heightMetres: 0.08, color: "#3d433a", outsetMetres: 0.59},
        {fraction: 0.06, widthFraction: 0.02, bottomMetres: 3.02, heightMetres: 0.88, color: "#3d433a", outsetMetres: 0.59},
        {fraction: 0.23, widthFraction: 0.02, bottomMetres: 3.02, heightMetres: 0.88, color: "#3d433a", outsetMetres: 0.59},
        {fraction: 0.4, widthFraction: 0.02, bottomMetres: 3.02, heightMetres: 0.88, color: "#3d433a", outsetMetres: 0.59},
        {fraction: 0.57, widthFraction: 0.02, bottomMetres: 3.02, heightMetres: 0.88, color: "#3d433a", outsetMetres: 0.59},
        {fraction: 0.74, widthFraction: 0.02, bottomMetres: 3.02, heightMetres: 0.88, color: "#3d433a", outsetMetres: 0.59},
        {fraction: 0.91, widthFraction: 0.02, bottomMetres: 3.02, heightMetres: 0.88, color: "#3d433a", outsetMetres: 0.59},
        {fraction: 0.23, widthFraction: 0.29, bottomMetres: 3.98, heightMetres: 1.02, color: "#927052", outsetMetres: 0.6}
      ]
    }
  },
  "way/1015118660": {
    sourceId: "way/1015118660",
    street: "Cricket Place",
    photoIds: ["R277", "R279", "R294"],
    source: "dense/flat-768/frame_0430_lens0_pitch+0.jpg",
    sourcePhotoCameras: [
      {photoId: "R277", timestamp: "14:20.860", lens: 0, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0430_lens0_pitch+0.jpg"},
      {photoId: "R279", timestamp: "14:24.864", lens: 0, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0432_lens0_pitch+0.jpg"},
      {photoId: "R294", timestamp: "15:16.916", lens: 1, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0458_lens1_pitch+0.jpg"}
    ],
    sourceMatch: {
      parcelIds: [4383],
      municipalBuildingIds: [6614],
      status: "Ordered photo continuity, current ring and municipal parcel/building association; no photographic GPS or surveyed facade dimensions."
    },
    observation: "Narrow red-brick house with green front gable and pale two-pane attic opening. Two narrow pale upper sashes; a small green-trimmed entry toward the east side, lower window toward the west. No full-width projecting porch is visible.",
    estimated: "Two upper sashes, one western ground sash and the small eastern green-trimmed entry are visible. Colors, door glazing, dimensions and fractions are estimated; the existing entry renderer simplifies the door glass. No broad porch is added. The green triangular gable and pale attic pair require separate roof-face work and are not represented by painting the red-brick body green. Source roof shape/height remain unchanged.",
    camera: {
      lat: 44.3071697492753,
      lon: -78.31119949239381,
      bearingDegrees: 162.35,
      roadId: "way/33960427",
      frontageIndex: 0,
      eyeAboveSampledRoadMetres: 2.1,
      targetAboveSampledBuildingBaseMetres: 2.5,
      reviewMode: "cab-seat",
      status: "Estimated review pose on the mapped road centerline, not a recovered recording position; sample terrain and verify visibility at runtime."
    },
    profile: {
      label: "EAST-CRICKET-21",
      name: "Green-trimmed brick house, south Cricket",
      confidence: "observed",
      frontLatLon: [
        {lat: 44.3070421, lon: -78.3111904},
        {lat: 44.3070624, lon: -78.3111041}
      ],
      style: "house",
      levels: 2,
      windowColumns: 1,
      detailHeightMetres: 5.9
    },
    appearance: {
      wallColor: "#955346",
      wallSurface: "brick",
      roofColor: "#4b6852",
      trimColor: "#e0e0d0",
      glassColor: "#5c7165",
      blankFacade: true,
      porch: false,
      entryDoor: {fraction: 0.78, widthMetres: 0.94, heightMetres: 2.14, color: "#d7e0cc"},
      signText: null,
      skipGroundWindows: true,
      features: [],
      groundWindows: [
        {t: 0.28, bottom: 3.55, width: 0.8, height: 1.47},
        {t: 0.72, bottom: 3.55, width: 0.8, height: 1.47},
        {t: 0.27, bottom: 0.75, width: 0.92, height: 1.42}
      ],
      facadePanels: [
        {fraction: 0.78, widthFraction: 0.24, bottomMetres: 0.03, heightMetres: 2.4, color: "#47785d", outsetMetres: 0.17},
        {fraction: 0.78, widthFraction: 0.28, bottomMetres: 2.4, heightMetres: 0.16, color: "#47785d", outsetMetres: 0.45}
      ]
    }
  },
  "way/1015118662": {
    sourceId: "way/1015118662",
    street: "Cricket Place",
    photoIds: ["R277", "R279", "R294"],
    source: "dense/flat-768/frame_0430_lens0_pitch+0.jpg",
    sourcePhotoCameras: [
      {photoId: "R277", timestamp: "14:20.860", lens: 0, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0430_lens0_pitch+0.jpg"},
      {photoId: "R279", timestamp: "14:24.864", lens: 0, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0432_lens0_pitch+0.jpg"},
      {photoId: "R294", timestamp: "15:16.916", lens: 1, pitchDegrees: 0, viewDirection: "south/SSE", source: "dense/flat-768/frame_0458_lens1_pitch+0.jpg"}
    ],
    sourceMatch: {
      parcelIds: [4386],
      municipalBuildingIds: [7796],
      status: "Ordered photo continuity, current ring and municipal parcel/building association; no photographic GPS or surveyed facade dimensions."
    },
    observation: "Pale/taupe masonry house with low gray hip roof and tall pale upper sash. Small projecting porch with white posts/rail and dark shallow canopy. Immediately east of the green-gable house; appears image-left when looking south.",
    estimated: "R277/R279 show two pale upper sashes and a pale-post porch. Colors, opening/porch dimensions and fractions are estimates; fine porch railing is deferred and partly hidden ground openings receive no guessed entry. The current source has an inferred gable despite the photographed shallow hip, so roof correction is a separate review. No ground scenery or adjoining-wall changes are included.",
    camera: {
      lat: 44.30720298594464,
      lon: -78.31105351938149,
      bearingDegrees: 162.35,
      roadId: "way/33960427",
      frontageIndex: 0,
      eyeAboveSampledRoadMetres: 2.1,
      targetAboveSampledBuildingBaseMetres: 2.5,
      reviewMode: "cab-seat",
      status: "Estimated review pose on the mapped road centerline, not a recovered recording position; sample terrain and verify visibility at runtime."
    },
    profile: {
      label: "EAST-CRICKET-25",
      name: "Pale hip-roof house east of green gable",
      confidence: "observed",
      frontLatLon: [
        {lat: 44.3070779, lon: -78.3110448},
        {lat: 44.3070979, lon: -78.3109599}
      ],
      style: "house",
      levels: 2,
      windowColumns: 1,
      detailHeightMetres: 5.15
    },
    appearance: {
      wallColor: "#b0a28e",
      wallSurface: "render",
      roofColor: "#626b61",
      trimColor: "#dedfcf",
      glassColor: "#61766e",
      blankFacade: true,
      porch: true,
      entryDoor: null,
      signText: null,
      skipGroundWindows: true,
      features: [],
      porchWidthFraction: 0.94,
      porchDepthMetres: 0.65,
      porchHeightMetres: 2.55,
      porchRoofColor: "#4e5e54",
      groundWindows: [
        {t: 0.28, bottom: 3.14, width: 0.87, height: 1.38},
        {t: 0.72, bottom: 3.14, width: 0.87, height: 1.38}
      ]
    }
  }
};
