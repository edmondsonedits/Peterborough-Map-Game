// Active photo route: Walmart lot → Chemong Road → Mason Avenue.
// Observations are from the supplied October 18, 2026 drive; numeric dimensions are estimates.
// Deferred Reid, Hunter, Cricket and open-canopy records are deliberately absent.
import {ROUTE_CORNER_APPEARANCES} from './route-corner-appearances.js?v=1.6.202';
import {ROUTE_STREET_APPEARANCES} from './route-street-appearances.js?v=1.6.202';

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
      "signFont": "700 46px Arial,sans-serif"
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
    "observation": "R051 shows cream trim, long glazing and a brown pitched main roof with a triangular glazed center gable and two smaller front gables; R053 confirms the roadside Dairy Queen identity. This pass changes wall trim and glazing only; the roof reconstruction remains queued.",
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
      "detailHeightMetres": 3.45
    },
    "appearance": {
      "wallColor": "#c6bba3",
      "trimColor": "#604b43",
      "entryDoor": {
        "fraction": 0.48,
        "color": "#d9d4c8",
        "widthMetres": 1.2
      },
      "facadePanels": [
        {
          "fraction": 0.5,
          "widthFraction": 0.98,
          "bottomMetres": 2.55,
          "heightMetres": 0.64,
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
    "estimated": "Dimensions, opening spacing, colors and surface roughness are visual estimates. Source footprint, height and roof geometry are retained."
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
      "detailHeightMetres": 3.7
    },
    "appearance": {
      "wallColor": "#c5b397",
      "trimColor": "#35322e",
      "signText": "LITTLE CAESARS",
      "signWidthMetres": 6.4,
      "signHeightMetres": 3.15,
      "signOutsetMetres": 0.45,
      "signBackgroundColor": "#35322e",
      "signBoardColor": "#35322e",
      "signTextColor": "#ec8758",
      "entryDoor": {
        "fraction": 0.72,
        "color": "#5d5143",
        "widthMetres": 1.2
      },
      "facadePanels": [
        {
          "fraction": 0.5,
          "widthFraction": 0.98,
          "bottomMetres": 2.55,
          "heightMetres": 1.04,
          "color": "#35322e",
          "outsetMetres": 0.36
        }
      ],
      "signFont": "700 46px Arial,sans-serif"
    },
    "photoIds": [
      "R053"
    ],
    "estimated": "Dimensions, opening spacing, colors and surface roughness are visual estimates. Source footprint, height and roof geometry are retained."
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
      "detailHeightMetres": 3.5
    },
    "appearance": {
      "wallColor": "#d7d5cb",
      "trimColor": "#747772",
      "signText": "KFC",
      "signWidthMetres": 2.8,
      "signHeightMetres": 2.85,
      "signFraction": 0.8,
      "signOutsetMetres": 0.45,
      "signBoardHeightMetres": 0.64,
      "signBackgroundColor": "#d7d5cb",
      "signBoardColor": "#d7d5cb",
      "signTextColor": "#a52f3a",
      "entryDoor": {
        "fraction": 0.29,
        "color": "#dddcd3",
        "widthMetres": 1.2
      },
      "facadePanels": [
        {
          "fraction": 0.29,
          "widthFraction": 0.22,
          "bottomMetres": 2.33,
          "heightMetres": 0.78,
          "color": "#9d3542",
          "outsetMetres": 0.36
        },
        {
          "fraction": 0.41,
          "widthFraction": 0.046,
          "bottomMetres": 0.08,
          "heightMetres": 3.03,
          "color": "#9d3542",
          "outsetMetres": 0.37
        }
      ],
      "signFont": "700 46px Arial,sans-serif"
    },
    "photoIds": [
      "R057"
    ],
    "estimated": "Dimensions, opening spacing, colors and surface roughness are visual estimates. Source footprint, height and roof geometry are retained."
  }
};

/** Merge only reviewed appearance cues; existing surveyed/profile massing wins. */
export function addRouteLandmarkAppearances(base, enabled = true) {
  if (!enabled) return base;
  const result = {...base};
  for (const records of [ROUTE_LANDMARK_APPEARANCES, ROUTE_CORNER_APPEARANCES, ROUTE_STREET_APPEARANCES]) {
    for (const [id, {appearance, profile}] of Object.entries(records)) {
      if (result[id]) result[id] = {...result[id], ...appearance, reviewedWallMaterial: true};
      else if (profile) result[id] = {...profile, ...appearance, id, appearanceOnly: true, preserveMappedMassing: true, reviewedWallMaterial: true};
    }
  }
  return result;
}
