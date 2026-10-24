// Visual estimates from owner footage; source footprints remain authoritative.
export const VIDEO_BUILDING_PROFILES = Object.freeze([
  {
    "id": "way/1006243562",
    "label": "V01",
    "name": "Commerce Building / St. Veronus",
    "confidence": "observed",
    "height": 10.5,
    "eaveHeight": 10.1,
    "roof": "flat",
    "roofRise": 0,
    "wallColor": "#9b4435",
    "roofColor": "#514943",
    "trimColor": "#45362f",
    "levels": 3,
    "windowColumns": 3,
    "style": "office",
    "features": [
      "corbelled-cornice",
      "masonry-plinth"
    ],
    "plinthHeight": 3.0,
    "plinthColor": "#80786d",
    "corniceColor": "#45362f",
    "atticBandHeight": 1.0,
    "atticWindowColumns": 6,
    "atticInfillColor": "#c8b49b",
    "signText": "ST. VERONUS",
    "signFraction": 0.5,
    "signHeightMetres": 2.9,
    "signWidthMetres": 4,
    "signBackgroundColor": "#39443f",
    "signBoardColor": "#39443f",
    "signTextColor": "#f4efe1",
    "frontLatLon": [
      {
        "lon": -78.3190501,
        "lat": 44.30585
      },
      {
        "lon": -78.319217,
        "lat": 44.305842
      }
    ],
    "additionalFrontages": [
      {
        "label": "Water wing",
        "frontLatLon": [
          {
            "lon": -78.3190501,
            "lat": 44.30585
          },
          {
            "lon": -78.3190123,
            "lat": 44.3053222
          }
        ],
        "windowColumns": 8,
        "atticWindowColumns": 16,
        "signText": null
      }
    ],
    "notes": "Observed red brick, three main levels, separate small arched attic openings, cornice and stone ground floor. Height and opening spacing are visual estimates. Both recorded street faces; rear/interior unknown.",
    "reference": {
      "file": "VID_20261018_073202_00_001.insv",
      "sourceSeconds": 750,
      "lens": 1,
      "sourceFrameSha256": "e2273badf47318e1fc2811c3303d7967ee232a85c7f71e4e9da7ccf21a87d6dd",
      "projection": "FisheyeReframer;2048x2048;100degree FOV; existing experimental calibration"
    }
  },
  {
    "id": "way/1006243555",
    "label": "V02",
    "name": "Scotiabank, Hunter/Water",
    "confidence": "observed",
    "height": 8.0,
    "eaveHeight": 7.6,
    "roof": "flat",
    "roofRise": 0,
    "wallColor": "#b3afa5",
    "roofColor": "#514943",
    "trimColor": "#615f59",
    "levels": 2,
    "windowColumns": 7,
    "style": "office",
    "features": [
      "masonry-plinth"
    ],
    "plinthHeight": 0.7,
    "plinthColor": "#77746e",
    "glazedLevels": [
      0,
      1
    ],
    "glazedLevelHeights": {
      "0": 2.4,
      "1": 1.5
    },
    "signText": "Scotiabank",
    "signHeightMetres": 3.5,
    "signWidthMetres": 8,
    "signBackgroundColor": "#ddd9cf",
    "signBoardColor": "#ddd9cf",
    "signTextColor": "#bf202b",
    "frontLatLon": [
      {
        "lon": -78.3187806,
        "lat": 44.3058618
      },
      {
        "lon": -78.3183934,
        "lat": 44.3058752
      }
    ],
    "additionalFrontages": [
      {
        "label": "Water face",
        "frontLatLon": [
          {
            "lon": -78.3187806,
            "lat": 44.3058618
          },
          {
            "lon": -78.3187638,
            "lat": 44.3056137
          }
        ],
        "windowColumns": 5,
        "signText": null
      }
    ],
    "notes": "Observed pale masonry, two levels, broad upper glazing and lower storefront glazing. Southeast Hunter/Water footprint is a spatial match, not an OSM business tag. Dimensions are visual estimates; unseen faces stay inferred.",
    "reference": {
      "file": "VID_20261018_073202_00_001.insv",
      "sourceSeconds": 750,
      "lens": 0,
      "sourceFrameSha256": "17828694e40b7cf2230b5b3899c278ae75b283c954e2a2c15cca26af98806fe4",
      "projection": "FisheyeReframer;2048x2048;100degree FOV; existing experimental calibration"
    }
  },
  {
    "id": "way/176908281",
    "label": "V03",
    "name": "Shoppers Drug Mart, 971 Chemong Road",
    "confidence": "observed",
    "height": 5.0,
    "eaveHeight": 4.8,
    "roof": "flat",
    "roofRise": 0,
    "wallColor": "#d9d4c5",
    "roofColor": "#55524c",
    "trimColor": "#c32732",
    "levels": 1,
    "windowColumns": 5,
    "style": "retail",
    "features": [
      "red-sign-band"
    ],
    "signText": "SHOPPERS DRUG MART",
    "signBackgroundColor": "#c32732",
    "signBoardColor": "#c32732",
    "signTextColor": "#ffffff",
    "signWidthMetres": 14,
    "signBoardHeightMetres": 1.0,
    "signHeightMetres": 4.1,
    "signOutsetMetres": 0.42,
    "frontLatLon": [
      {
        "lon": -78.3358453,
        "lat": 44.3231613
      },
      {
        "lon": -78.3356077,
        "lat": 44.3229136
      }
    ],
    "notes": "Direct storefront sign at01:00 plus named addressed OSM building confirm identity. One-level light retail facade, flat parapet and red sign band; opening rhythm and dimensions remain compact visual estimates. Rear/sides not asserted.",
    "reference": {
      "file": "VID_20261018_073202_00_001.insv",
      "sourceSeconds": 60,
      "lens": 0,
      "sourceFrameSha256": "1d987dc3a1df8373dfb965bdcbf540c16ecfd0405be83d92cfa5b863a7e5fe2c",
      "projection": "FisheyeReframer;2048x2048;100degree FOV; existing experimental calibration"
    }
  }
]);
