// Active photo route: Walmart lot → Chemong Road → Mason Avenue.
// Observations are from the supplied October 18, 2026 drive; numeric dimensions are estimates.
// Deferred Reid, Hunter, Cricket and open-canopy records are deliberately absent.
export const ROUTE_CORNER_APPEARANCES = {
  "way/176908281": {
    "street": "Chemong Road",
    "source": "dense/flat-768/frame_0036_lens0_pitch+0.jpg",
    "observation": "Shoppers’ raised red fascia is framed by matching red side piers around the tall glass entrance; the other bays use pale walls.",
    "appearance": {
      "wallColor": "#ded9c9",
      "signBoardHeightMetres": 1.18,
      "glassColor": "#5e736c",
      "facadePanels": [
        {
          "fraction": 0.5,
          "widthFraction": 0.32,
          "bottomMetres": 3.36,
          "heightMetres": 1.15,
          "color": "#b62933",
          "outsetMetres": 0.35
        },
        {
          "fraction": 0.36,
          "widthFraction": 0.032,
          "bottomMetres": 0.12,
          "heightMetres": 3.22,
          "color": "#b62933",
          "outsetMetres": 0.33
        },
        {
          "fraction": 0.64,
          "widthFraction": 0.032,
          "bottomMetres": 0.12,
          "heightMetres": 3.22,
          "color": "#b62933",
          "outsetMetres": 0.33
        }
      ],
      "entryDoor": {
        "fraction": 0.5,
        "color": "#c5c2b7",
        "widthMetres": 1.2
      },
      "signFont": "700 46px Arial,sans-serif",
      "signWidthMetres": 9.6
    },
    "photoIds": [
      "R026"
    ],
    "estimated": "Dimensions, opening spacing, colors and surface roughness are visual estimates. Source footprint, height and roof geometry are retained."
  },
  "way/446343896": {
    "street": "Chemong Road",
    "intersection": "Chemong Road / Sunset Boulevard",
    "source": "dense/flat-768/frame_0047_lens1_pitch+0.jpg",
    "observation": "Low pale masonry dental office across Sunset with a dark fascia and narrow green-gray windows. The R033/R035 wordmarks are too blurred to validate the tenant wording; no named sign is restored.",
    "profile": {
      "label": "CHEM-890",
      "name": "Chemong Family Dentistry",
      "confidence": "observed",
      "style": "office",
      "levels": 1,
      "windowColumns": 6,
      "frontLatLon": [
        {
          "lat": 44.3206109,
          "lon": -78.3325545
        },
        {
          "lat": 44.3204106,
          "lon": -78.3323566
        }
      ],
      "detailHeightMetres": 2.6
    },
    "appearance": {
      "wallColor": "#c7bdab",
      "trimColor": "#53544b",
      "glassColor": "#57716d",
      "windowWidthMetres": 1.04,
      "facadePanels": [
        {
          "fraction": 0.5,
          "widthFraction": 0.97,
          "bottomMetres": 2.12,
          "heightMetres": 0.38,
          "color": "#6a6659",
          "outsetMetres": 0.31
        }
      ],
      "windowHeightMetres": 1.28
    },
    "photoIds": [
      "R033",
      "R035"
    ],
    "estimated": "Dimensions, opening spacing, colors and surface roughness are visual estimates. Source footprint, height and roof geometry are retained. Decorative openings, fascia and signs are fitted to the current 2.60 m rendered source wall; this is not a measured physical building height. Correcting the inferred roof and storey height is a separate geometry review."
  },
  "way/383393878": {
    "street": "Chemong Road",
    "intersection": "Chemong Road / Highland Road",
    "source": "dense/flat-768/frame_0052_lens0_pitch+0.jpg",
    "observation": "Pizza Pizza occupies the left storefront and Tim Hortons the right, with separate red signs on the charcoal fascia and a pale strip above the Tim Hortons glazing.",
    "profile": {
      "label": "CHEM-871",
      "name": "Pizza Pizza and Tim Hortons",
      "confidence": "observed",
      "style": "retail",
      "levels": 1,
      "windowColumns": 3,
      "frontLatLon": [
        {
          "lat": 44.3191367,
          "lon": -78.3320619
        },
        {
          "lat": 44.3192059,
          "lon": -78.3322188
        }
      ],
      "detailHeightMetres": 2.6
    },
    "appearance": {
      "wallColor": "#b9ad95",
      "trimColor": "#3e3b37",
      "signText": "PIZZA PIZZA",
      "signWidthMetres": 4,
      "signHeightMetres": 2.3,
      "signBoardHeightMetres": 0.4,
      "signOutsetMetres": 0.45,
      "signBoardColor": "#a73632",
      "signBackgroundColor": "#a73632",
      "signTextColor": "#fff4de",
      "facadePanels": [
        {
          "fraction": 0.5,
          "widthFraction": 0.98,
          "bottomMetres": 2.08,
          "heightMetres": 0.48,
          "color": "#3e3b37",
          "outsetMetres": 0.35
        }
      ],
      "additionalFrontages": [
        {
          "label": "Tim Hortons storefront",
          "frontLatLon": [
            {
              "lat": 44.31924,
              "lon": -78.3321964
            },
            {
              "lat": 44.3193081,
              "lon": -78.3323575
            }
          ],
          "style": "retail",
          "levels": 1,
          "windowColumns": 4,
          "signText": "TIM HORTONS",
          "signFraction": 0.52,
          "signHeightMetres": 2.3,
          "signWidthMetres": 4.65,
          "signBoardColor": "#444038",
          "signBackgroundColor": "#444038",
          "signTextColor": "#df473f",
          "facadePanels": [
            {
              "fraction": 0.5,
              "widthFraction": 0.98,
              "bottomMetres": 2.14,
              "heightMetres": 0.42,
              "color": "#443f38",
              "outsetMetres": 0.35
            },
            {
              "fraction": 0.5,
              "widthFraction": 0.94,
              "bottomMetres": 2.045,
              "heightMetres": 0.07,
              "color": "#b7a889",
              "outsetMetres": 0.36
            }
          ],
          "signBoardHeightMetres": 0.3
        }
      ],
      "signFont": "700 46px Arial,sans-serif"
    },
    "photoIds": [
      "R037"
    ],
    "estimated": "Dimensions, opening spacing, colors and surface roughness are visual estimates. Source footprint, height and roof geometry are retained. Decorative openings, fascia and signs are fitted to the current 2.60 m rendered source wall; this is not a measured physical building height. Correcting the inferred roof and storey height is a separate geometry review."
  },
  "way/77717331": {
    "street": "Chemong Road",
    "intersection": "Chemong Road / Bellevue Street",
    "source": "dense/flat-768/frame_0069_lens0_pitch+0.jpg",
    "observation": "Continuous low storefront row, pale fascia and glazing across the parking lot. Dollarama lettering is visible at the cropped north end, but its exact facade fraction is unresolved; no sign is placed.",
    "profile": {
      "label": "CHEM-BROOKDALE",
      "name": "Brookdale Plaza",
      "confidence": "observed",
      "style": "retail",
      "levels": 1,
      "windowColumns": 12,
      "frontLatLon": [
        {
          "lat": 44.3185735,
          "lon": -78.332052
        },
        {
          "lat": 44.3191385,
          "lon": -78.3326015
        }
      ],
      "detailHeightMetres": 3.6
    },
    "appearance": {
      "wallColor": "#bbb3a0",
      "trimColor": "#776e60",
      "glazedLevels": [
        0
      ],
      "glazedLevelHeights": {
        "0": 1.8
      },
      "additionalFrontages": [
        {
          "label": "South shop row",
          "frontLatLon": [
            {
              "lat": 44.3177036,
              "lon": -78.3314063
            },
            {
              "lat": 44.3185126,
              "lon": -78.3321744
            }
          ],
          "signText": null
        }
      ]
    },
    "photoIds": [
      "R048"
    ],
    "estimated": "Dimensions, opening spacing, colors and surface roughness are visual estimates. Source footprint, height and roof geometry are retained."
  },
  "way/176910551": {
    "street": "Chemong Road",
    "intersection": "Chemong Road / Wolsely Street",
    "source": "dense/flat-768/frame_0078_lens1_pitch+0.jpg",
    "observation": "Four broad dark/glazed shop bays separated by pale rectangular posts, with dark sign panels above; tenant lettering is unreadable.",
    "profile": {
      "label": "CHEM-806",
      "name": "806 Chemong Road storefronts",
      "confidence": "observed",
      "style": "retail",
      "levels": 1,
      "windowColumns": 4,
      "frontLatLon": [
        {
          "lat": 44.3175113,
          "lon": -78.3295858
        },
        {
          "lat": 44.31724,
          "lon": -78.3293182
        }
      ],
      "detailHeightMetres": 3.4
    },
    "appearance": {
      "wallColor": "#c8c3b5",
      "trimColor": "#3e403a",
      "facadePanels": [
        {
          "fraction": 0.125,
          "widthFraction": 0.21,
          "bottomMetres": 2.26,
          "heightMetres": 0.54,
          "color": "#464846",
          "outsetMetres": 0.32
        },
        {
          "fraction": 0.375,
          "widthFraction": 0.21,
          "bottomMetres": 2.26,
          "heightMetres": 0.54,
          "color": "#464846",
          "outsetMetres": 0.32
        },
        {
          "fraction": 0.625,
          "widthFraction": 0.21,
          "bottomMetres": 2.26,
          "heightMetres": 0.54,
          "color": "#464846",
          "outsetMetres": 0.32
        },
        {
          "fraction": 0.875,
          "widthFraction": 0.21,
          "bottomMetres": 2.26,
          "heightMetres": 0.54,
          "color": "#464846",
          "outsetMetres": 0.32
        }
      ],
      "signFont": "700 46px Arial,sans-serif",
      "windowOverrides": [
        {
          "level": 0,
          "column": 0,
          "bottomMetres": 0.25,
          "heightMetres": 1.8
        },
        {
          "level": 0,
          "column": 1,
          "bottomMetres": 0.25,
          "heightMetres": 1.8
        },
        {
          "level": 0,
          "column": 2,
          "bottomMetres": 0.25,
          "heightMetres": 1.8
        },
        {
          "level": 0,
          "column": 3,
          "bottomMetres": 0.25,
          "heightMetres": 1.8
        }
      ]
    },
    "photoIds": [
      "R055"
    ],
    "estimated": "Dimensions, opening spacing, colors and surface roughness are visual estimates. Source footprint, height and roof geometry are retained."
  }
};
