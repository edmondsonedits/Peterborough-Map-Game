// Active photo route: Walmart lot → Chemong → Reid → Sherbrooke → Water/Hunter → East City.
// Observations are from the supplied October 18, 2026 drive; numeric dimensions are estimates.
// Unresolved matches and open-canopy records remain absent.
import {ROUTE_CORNER_APPEARANCES} from './route-corner-appearances.js?v=1.6.206';
import {ROUTE_STREET_APPEARANCES} from './route-street-appearances.js?v=1.6.206';
import {ROUTE_REID_APPEARANCES} from './route-reid-appearances.js?v=1.6.206';
import {ROUTE_SHERBROOKE_APPEARANCES} from './route-sherbrooke-appearances.js?v=1.6.206';
import {ROUTE_WATER_APPEARANCES} from './route-water-appearances.js?v=1.6.206';
import {ROUTE_EAST_CITY_APPEARANCES} from './route-east-city-appearances.js?v=1.6.206';

export const ROUTE_LANDMARK_APPEARANCES = {
  "way/755556771": {
    "street": "Chemong Road",
    "source": "flat-priority-2048/0075s_lens0_pitch+0_up15.jpg",
    "observation": "Starbucks has a light side wall and dark front with white lettering and tall glazing.",
    "profile": {
      "label": "CHEM-959",
      "name": "Starbucks, 959 Chemong Road",
      "confidence": "observed",
      "frontLatLon": [
        {
          "lat": 44.3223314,
          "lon": -78.3350856
        },
        {
          "lat": 44.3224065,
          "lon": -78.3351519
        }
      ],
      "style": "retail",
      "levels": 1,
      "windowColumns": 3,
      "detailHeightMetres": 4.2
    },
    "appearance": {
      "wallColor": "#d2d0c5",
      "trimColor": "#363633",
      "signText": "STARBUCKS COFFEE",
      "signBusinessName": "Starbucks",
      "signWidthMetres": 5.5,
      "signHeightMetres": 3.45,
      "signOutsetMetres": 0.45,
      "signBackgroundColor": "#383735",
      "signBoardColor": "#383735",
      "signTextColor": "#f1eee5",
      "entryDoor": {
        "fraction": 0.5,
        "color": "#353734",
        "widthMetres": 1.2
      },
      "facadePanels": [
        {
          "fraction": 0.5,
          "widthFraction": 0.98,
          "bottomMetres": 2.7,
          "heightMetres": 1.23,
          "color": "#383735",
          "outsetMetres": 0.36
        }
      ],
      "signFont": "700 46px Arial,sans-serif",
      "windowOverrides": [
        {
          "level": 0,
          "column": 0,
          "bottomMetres": 0.22,
          "heightMetres": 2.35
        },
        {
          "level": 0,
          "column": 2,
          "bottomMetres": 0.22,
          "heightMetres": 2.35
        }
      ]
    },
    "photoIds": [
      "R026",
      "R028"
    ],
    "estimated": "Dimensions, opening spacing, colors and surface roughness are visual estimates. Source footprint, height and roof geometry are retained."
  },
  "way/446339099": {
    "street": "Chemong Road",
    "source": "dense/flat-768/frame_0072_lens1_pitch+0.jpg",
    "observation": "R051 shows cream trim, long glazing and a brown pitched main roof with a triangular glazed center gable and two smaller front gables; R053 confirms the roadside Dairy Queen identity.",
    "profile": {
      "label": "CHEM-828",
      "name": "Dairy Queen, 828 Chemong Road",
      "confidence": "observed",
      "frontLatLon": [
        {
          "lat": 44.3183591,
          "lon": -78.3302797
        },
        {
          "lat": 44.3181924,
          "lon": -78.3301201
        }
      ],
      "style": "retail",
      "levels": 1,
      "windowColumns": 7,
      "detailHeightMetres": 2.6
    },
    "appearance": {
      "wallColor": "#c6bba3",
      "roofColor": "#695248",
      "recordedRoof": {
        "shape": "hipped",
        "frontGables": [
          {"fraction": 0.24, "widthMetres": 3, "riseMetres": 0.85},
          {"fraction": 0.5, "widthMetres": 5.8, "riseFraction": 1, "glazed": true},
          {"fraction": 0.77, "widthMetres": 3, "riseMetres": 0.85}
        ]
      },
      "trimColor": "#604b43",
      "entryDoor": {
        "fraction": 0.48,
        "color": "#d9d4c8",
        "widthMetres": 1.2,
        "heightMetres": 2.05
      },
      "facadePanels": [
        {
          "fraction": 0.5,
          "widthFraction": 0.98,
          "bottomMetres": 2.08,
          "heightMetres": 0.48,
          "color": "#51423c",
          "outsetMetres": 0.33
        }
      ],
      "signFont": "700 46px Arial,sans-serif"
    },
    "photoIds": [
      "R051",
      "R053"
    ],
    "estimated": "Dimensions, opening spacing, colors and surface roughness are visual estimates. Exact footprint, 2.60 m source wall and existing maximum roof height are retained. The pitched main roof and three front gables follow R051; hidden hip topology, 3/5.8/3 m projection widths and 0.24/0.50/0.77 frontage fractions are estimates. Glass is inset into the central triangular gable. No source-storey height measurement is claimed."
  },
  "way/446343895": {
    "street": "Chemong Road",
    "source": "dense/flat-768/frame_0075_lens1_pitch+0.jpg",
    "observation": "Little Caesars has pale masonry, a charcoal fascia, orange lettering, broad front windows and a paved forecourt.",
    "profile": {
      "label": "CHEM-816",
      "name": "Little Caesars, 816 Chemong Road",
      "confidence": "observed",
      "frontLatLon": [
        {
          "lat": 44.317788,
          "lon": -78.3299294
        },
        {
          "lat": 44.3177062,
          "lon": -78.3298498
        }
      ],
      "style": "retail",
      "levels": 1,
      "windowColumns": 4,
      "detailHeightMetres": 2.6
    },
    "appearance": {
      "wallColor": "#c5b397",
      "trimColor": "#35322e",
      "signText": "LITTLE CAESARS",
      "signWidthMetres": 6.4,
      "signHeightMetres": 2.3,
      "signOutsetMetres": 0.45,
      "signBackgroundColor": "#35322e",
      "signBoardColor": "#35322e",
      "signTextColor": "#ec8758",
      "entryDoor": {
        "fraction": 0.72,
        "color": "#5d5143",
        "widthMetres": 1.2,
        "heightMetres": 2.05
      },
      "facadePanels": [
        {
          "fraction": 0.5,
          "widthFraction": 0.98,
          "bottomMetres": 2.08,
          "heightMetres": 0.48,
          "color": "#35322e",
          "outsetMetres": 0.36
        }
      ],
      "signFont": "700 46px Arial,sans-serif",
      "signBoardHeightMetres": 0.4
    },
    "photoIds": [
      "R053"
    ],
    "estimated": "Dimensions, opening spacing, colors and surface roughness are visual estimates. Source footprint, height and roof geometry are retained. Decorative openings, fascia and signs are fitted to the current 2.60 m rendered source wall; this is not a measured physical building height. Correcting the inferred roof and storey height is a separate geometry review."
  },
  "way/446366842": {
    "street": "Chemong Road",
    "source": "dense/flat-768/frame_0080_lens1_pitch+0.jpg",
    "observation": "KFC has a flat pale fascia, red entrance trim to the north, KFC lettering to the south, wide dark glazing, a grass verge, and a red roadside pylon.",
    "profile": {
      "label": "CHEM-786",
      "name": "KFC, 786 Chemong Road",
      "confidence": "observed",
      "frontLatLon": [
        {
          "lat": 44.3169592,
          "lon": -78.3291289
        },
        {
          "lat": 44.316827,
          "lon": -78.3289997
        }
      ],
      "style": "retail",
      "levels": 1,
      "windowColumns": 5,
      "detailHeightMetres": 2.6
    },
    "appearance": {
      "wallColor": "#d7d5cb",
      "trimColor": "#747772",
      "signText": "KFC",
      "signWidthMetres": 2.8,
      "signHeightMetres": 2.3,
      "signFraction": 0.8,
      "signOutsetMetres": 0.45,
      "signBoardHeightMetres": 0.4,
      "signBackgroundColor": "#d7d5cb",
      "signBoardColor": "#d7d5cb",
      "signTextColor": "#a52f3a",
      "entryDoor": {
        "fraction": 0.29,
        "color": "#dddcd3",
        "widthMetres": 1.2,
        "heightMetres": 2.05
      },
      "facadePanels": [
        {
          "fraction": 0.29,
          "widthFraction": 0.22,
          "bottomMetres": 2.1,
          "heightMetres": 0.46,
          "color": "#9d3542",
          "outsetMetres": 0.36
        },
        {
          "fraction": 0.41,
          "widthFraction": 0.046,
          "bottomMetres": 0.08,
          "heightMetres": 2.48,
          "color": "#9d3542",
          "outsetMetres": 0.37
        }
      ],
      "signFont": "700 46px Arial,sans-serif"
    },
    "photoIds": [
      "R057"
    ],
    "estimated": "Dimensions, opening spacing, colors and surface roughness are visual estimates. Source footprint, height and roof geometry are retained. Decorative openings, fascia and signs are fitted to the current 2.60 m rendered source wall; this is not a measured physical building height. Correcting the inferred roof and storey height is a separate geometry review."
  }
};

/** Merge only reviewed appearance cues; existing surveyed/profile massing wins. */
export function addRouteLandmarkAppearances(base, enabled = true) {
  if (!enabled) return base;
  const result = {...base};
  for (const records of [ROUTE_LANDMARK_APPEARANCES, ROUTE_CORNER_APPEARANCES, ROUTE_STREET_APPEARANCES, ROUTE_REID_APPEARANCES, ROUTE_SHERBROOKE_APPEARANCES, ROUTE_WATER_APPEARANCES, ROUTE_EAST_CITY_APPEARANCES]) {
    for (const [id, {appearance, profile}] of Object.entries(records)) {
      if (result[id]) result[id] = {...result[id], ...appearance, reviewedWallMaterial: true};
      else if (profile) result[id] = {...profile, ...appearance, id, appearanceOnly: true, preserveMappedMassing: true, reviewedWallMaterial: true};
    }
  }
  return result;
}
