// Reviewed visual profiles; original map footprints and collision remain authoritative.
import { VIDEO_BUILDING_PROFILES } from './video-building-profiles.js';
import { ROUTE_BUILDING_PROFILES } from './route-building-profiles.js';
import { WEB_BUILDING_PROFILES } from './web-building-profiles.js?v=1.6.135';
export const FOOTAGE_PROFILES = Object.fromEntries([
  {
    "id": "way/1009651251",
    "label": "N01",
    "name": "Royal Heritage / Royal LePage office",
    "confidence": "partial",
    "height": 9.5,
    "eaveHeight": 9.2,
    "roof": "flat",
    "roofRise": 0,
    "wallColor": "#8f4938",
    "roofColor": "#674c43",
    "trimColor": "#272a28",
    "levels": 3,
    "windowColumns": 4,
    "style": "office",
    "features": [
      "large-glazed-corner",
      "brick-office-wing"
    ],
    "signText": "ROYAL LEPAGE",
    "notes": "The visible red-brick office with corner glazing and ROYAL LEPAGE sign is separate from Fire Station 1. Mapping follows ordered side views; trees and angle obscure windows; height is a visual estimate.",
    "reference": {
      "file": "references/0149_LEFT_SIDE.jpg",
      "sourceSequence": 149,
      "sourceSeconds": 121.488033,
      "sha256": "a6752e9be628bd60524f4a32701ece852c44e63f61ddddc03df1779a5e5acd8f"
    },
    "texturePatch": null,
    "largeGlazedFront": true,
    "frontLatLon": [
      {
        "lon": -78.32283200079098,
        "lat": 44.30078179957444
      },
      {
        "lon": -78.32261950084573,
        "lat": 44.30078849988705
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform."
  },
  {
    "id": "way/1009651229",
    "label": "N02",
    "name": "Peterborough Fire Station 1",
    "confidence": "observed",
    "height": 6.8,
    "eaveHeight": 6.1,
    "roof": "flat",
    "roofRise": 0,
    "wallColor": "#9b513f",
    "roofColor": "#514943",
    "trimColor": "#282c2b",
    "levels": 1,
    "windowColumns": 5,
    "style": "station",
    "features": [
      "five-apparatus-bays",
      "separate-entry-wing",
      "office-facade-segment"
    ],
    "signText": null,
    "notes": "Five red apparatus doors are directly visible in a clearer near-frontal still (0158_LEFT_SIDE.jpg); this footage observation overrides the earlier four-bay GIS annotation. Keep the distinct entry and public-office facade portions recorded in block.json surveyDetails; adjacent Royal LePage is N01. Height is estimated, not surveyed.",
    "reference": {
      "file": "references/0158_LEFT_SIDE.jpg",
      "sourceSequence": 158,
      "sourceSeconds": 127.760967,
      "sha256": "ce4ce7085b801ee1e44690276c31b982c768dceff6fa4de000b02d940b896759"
    },
    "texturePatch": {
      "file": "references/0158_LEFT_SIDE.jpg",
      "quad": [
        [
          0.1768,
          0.526
        ],
        [
          0.508,
          0.528
        ],
        [
          0.508,
          0.358
        ],
        [
          0.178,
          0.366
        ]
      ],
      "target": {
        "widthFraction": 1,
        "heightFraction": 0.74,
        "bottomMetres": 0.15,
        "facadeRole": "apparatus-bays"
      },
      "note": "Five visible apparatus doors and header band only. Near-frontal unoccluded section from the clearer 0158 view; map this patch to the apparatus-bay facade segment rather than the entire N02 frontage."
    },
    "bayCount": 5,
    "frontLatLon": [
      {
        "lon": -78.32241510046063,
        "lat": 44.30088680026669
      },
      {
        "lon": -78.3221152012898,
        "lat": 44.30089739966529
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform."
  },
  {
    "id": "way/194192530",
    "label": "N03",
    "name": "LCBO Sherbrooke storefront",
    "confidence": "partial",
    "height": 4.7,
    "eaveHeight": 4.1,
    "roof": "flat",
    "roofRise": 0,
    "wallColor": "#deded0",
    "roofColor": "#4b5b45",
    "trimColor": "#31553c",
    "levels": 1,
    "windowColumns": 3,
    "style": "retail",
    "features": [
      "green-parapet-trim",
      "black-sign-awnings",
      "metal-security-grilles"
    ],
    "signText": "LCBO",
    "notes": "Low pale storefront with green parapet and three black LCBO sign/awning bays. Foreground access rail, parking lot and angle prevent a clean full-wall texture; identity and height remain approximate.",
    "reference": {
      "file": "references/0170_LEFT_SIDE.jpg",
      "sourceSequence": 170,
      "sourceSeconds": 136.7366,
      "sha256": "9160af9abe66a6630f1dd2038bcc5a434e03c1ed4c0c8c55572e9bb2c893c4ab"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.32156360160175,
        "lat": 44.300845399985064
      },
      {
        "lon": -78.32136980224736,
        "lat": 44.300852399862464
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform.",
    "facadePhoto": {
      "file": "./assets/sherbrooke-frontages/n03.jpg",
      "widthFraction": 1,
      "centerFraction": 0.5,
      "bottomMetres": 1.15,
      "heightMetres": 2.9,
      "gableHeightMetres": 0,
      "sha256": "c1a4b5e7d105363049dbb8adbf3be5e300b731cbb2fa4a60ee34b8e3d4b46691",
      "sourceSha256": "1da9f8c31518416e7002e4f2e3f43749574ead930dbd8f629922e1dc736963a8",
      "sourceFrame": "0174_LEFT_SIDE.jpg",
      "note": "Upper storefront only; crop stops before the foreground railing."
    }
  },
  {
    "id": "way/1009651239",
    "label": "N04",
    "name": "Good Neighbours Care Centre",
    "confidence": "partial",
    "height": 7.8,
    "eaveHeight": 7.5,
    "roof": "flat",
    "roofRise": 0,
    "wallColor": "#a3a285",
    "roofColor": "#55504a",
    "trimColor": "#4a4438",
    "levels": 2,
    "windowColumns": 6,
    "style": "office",
    "features": [
      "brick",
      "street-facing-identification-sign"
    ],
    "signText": "Good Neighbours Care Centre",
    "notes": "Full source shows two principal storeys with repeated rectangular openings and pale tan/green masonry; correct earlier estimated three-storey profile.",
    "reference": {
      "file": "VID_20261018_073202_00_001.insv",
      "sourceSeconds": 528,
      "lens": 1,
      "sourceFrameSha256": "9a54358246632ac73b2d09b39176e248fe99a9da190e3d042f80e36e9190fca7",
      "neighborSeconds": [
        522,
        534
      ],
      "projection": "FisheyeReframer 2048px / 100deg; existing experimental calibration"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.3205896023429,
        "lat": 44.30084930030126
      },
      {
        "lon": -78.32027020366444,
        "lat": 44.300860000122555
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform."
  },
  {
    "id": "way/1009651244",
    "label": "N05",
    "name": "Unidentified rear building candidate",
    "confidence": "inferred",
    "height": 5.2,
    "eaveHeight": 4.8,
    "roof": "flat",
    "roofRise": 0,
    "wallColor": "#c6bd9f",
    "roofColor": "#605a50",
    "trimColor": "#665f53",
    "levels": 1,
    "windowColumns": 0,
    "style": "retail",
    "features": [],
    "signText": null,
    "notes": "Footprint lies behind/overlaps Village of Thai frontage in source-aligned map geometry. Stills give only partial adjacent service/rear context; street-facing use, openings, roof and height are unasserted approximations.",
    "reference": {
      "file": "references/0200_LEFT_SIDE.jpg",
      "sourceSequence": 200,
      "sourceSeconds": 164.2641,
      "sha256": "a34545923c0fc277a880a7930226f2e6a37208d734be43de788ba07a1b46cd92"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.32021510280289,
        "lat": 44.301086700254366
      },
      {
        "lon": -78.31985220389305,
        "lat": 44.30110219962528
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform."
  },
  {
    "id": "way/1009651245",
    "label": "N06",
    "name": "Unidentified rear building candidate",
    "confidence": "inferred",
    "height": 4.4,
    "eaveHeight": 4.1,
    "roof": "flat",
    "roofRise": 0,
    "wallColor": "#d0c5a7",
    "roofColor": "#625a50",
    "trimColor": "#665f53",
    "levels": 1,
    "windowColumns": 0,
    "style": "retail",
    "features": [],
    "signText": null,
    "notes": "Small overlapping/rear candidate footprint near Village of Thai corner. No independent street-facing facade is resolved; dimensions and appearance are placeholders for a simple mass.",
    "reference": {
      "file": "references/0200_LEFT_SIDE.jpg",
      "sourceSequence": 200,
      "sourceSeconds": 164.2641,
      "sha256": "a34545923c0fc277a880a7930226f2e6a37208d734be43de788ba07a1b46cd92"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.32000670329806,
        "lat": 44.3009736999394
      },
      {
        "lon": -78.31985280363651,
        "lat": 44.30097749977851
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform."
  },
  {
    "id": "way/846927296",
    "label": "N07",
    "name": "Village of Thai corner building",
    "confidence": "observed",
    "height": 10.0,
    "eaveHeight": 9.6,
    "roof": "flat",
    "roofRise": 0,
    "wallColor": "#dfd0a8",
    "roofColor": "#534d43",
    "trimColor": "#8c5a42",
    "levels": 2,
    "windowColumns": 3,
    "style": "office",
    "features": [
      "corner-shop-sign",
      "Peterborough-BORO-mural",
      "upper-storey-windows"
    ],
    "signText": "VILLAGE OF THAI",
    "notes": "Corner wall visibly carries Village of Thai sign and Peterborough BORO mural; upper windows and pale brick wing extend left. Exact division from overlapping N05/N06 candidates follows map polygons, not solved camera pose. Ground facade uses the visible door/window at the left and mural at the right, not inferred retail glazing.",
    "reference": {
      "file": "references/0200_LEFT_SIDE.jpg",
      "sourceSequence": 200,
      "sourceSeconds": 164.2641,
      "sha256": "a34545923c0fc277a880a7930226f2e6a37208d734be43de788ba07a1b46cd92"
    },
    "texturePatch": {
      "file": "./data/sherbrooke-footage/village-thai-mural-source.jpg",
      "quad": [
        [
          0.4736328125,
          0.621875
        ],
        [
          0.8984375,
          0.659375
        ],
        [
          0.8984375,
          0.384375
        ],
        [
          0.4736328125,
          0.35833333333333334
        ]
      ],
      "target": {
        "widthFraction": 0.66,
        "heightFraction": 0.34,
        "bottomMetres": 0.12,
        "centerFraction": 0.56
      },
      "note": "Reviewed central lower mural, including painted clock tower and BORO lettering. Excludes the right-edge traffic signal, sky, sidewalk and grass. Attached wall duct is preserved as part of the surface appearance. Sign above remains modeled text, not this image patch.",
      "sourceFile": "references/0200_LEFT_SIDE.jpg"
    },
    "skipGroundWindows": true,
    "groundWindows": [
      {
        "t": 0.19,
        "width": 0.95,
        "height": 1.75,
        "bottom": 0.75
      }
    ],
    "doorFraction": 0.065,
    "frontLatLon": [
      {
        "lon": -78.32003880294276,
        "lat": 44.30086429997905
      },
      {
        "lon": -78.31984580379874,
        "lat": 44.30087270031241
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform."
  },
  {
    "id": "way/1006575745",
    "label": "S01",
    "name": "Aylmer corner brick residence",
    "confidence": "partial",
    "height": 5.3,
    "eaveHeight": 3.6,
    "roof": "hip",
    "roofRise": 1.7,
    "wallColor": "#783b31",
    "roofColor": "#414541",
    "trimColor": "#e8e3d4",
    "levels": 1,
    "windowColumns": 3,
    "style": "house",
    "features": [
      "porch"
    ],
    "signText": null,
    "notes": "Frame0140 shows the south-east corner residence beside Aylmer: a low brick frontage, raised stone foundation and hip-roofed front volume. A taller rear portion is partly obscured and simplified. This replaces an earlier wrong-block reference; dimensions are estimates, not surveyed.",
    "reference": {
      "file": "references/0140_RIGHT_SIDE.jpg",
      "sourceSequence": 140,
      "sourceSeconds": 115.748967,
      "sha256": "b4727e00d426d883bfcb015862e9e0894b382e6544a8003207ac37975db7054d"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.32284819998515,
        "lat": 44.300515300242324
      },
      {
        "lon": -78.32271670086449,
        "lat": 44.30052090034943
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform.",
    "porchWidthFraction": 0.82,
    "porchDepthMetres": 1.5,
    "porchHeightMetres": 2.5,
    "frontGarden": {
      "depthMetres": 7,
      "pathFraction": 0.2,
      "pathWidthMetres": 1.2,
      "lawnColor": "#65754b",
      "hedge": false,
      "evidenceFrame": "0140_RIGHT_SIDE.jpg",
      "accuracy": "Visual estimate from footage, clipped to existing mapped clear ground."
    },
    "frontageReview": {
      "frame": "0140_RIGHT_SIDE.jpg",
      "sha256": "b4727e00d426d883bfcb015862e9e0894b382e6544a8003207ac37975db7054d",
      "method": "Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed."
    }
  },
  {
    "id": "way/1006575705",
    "label": "S02",
    "name": "Sherbrooke south-side house",
    "confidence": "partial",
    "height": 7.2,
    "eaveHeight": 5.6,
    "roof": "gable",
    "roofRise": 1.6,
    "wallColor": "#874a3c",
    "roofColor": "#494b47",
    "trimColor": "#e8e4d6",
    "levels": 2,
    "windowColumns": 4,
    "style": "house",
    "features": [
      "front-porch"
    ],
    "signText": null,
    "notes": "Frame0144 provides correct in-block context just east of Aylmer: the next brick residence is partly hidden by a large tree. Two-storey masonry, porch and dark roof are approximate; exact openings and rear silhouette remain unverified. Earlier pre-Aylmer reference was removed.",
    "reference": {
      "file": "references/0144_RIGHT_SIDE.jpg",
      "sourceSequence": 144,
      "sourceSeconds": 117.750967,
      "sha256": "b804d39c86ba87b5c249a11a35ffa0b699c7b2311c52096496be3d2a2a195672"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.3226803008452,
        "lat": 44.300506000023546
      },
      {
        "lon": -78.32252000060005,
        "lat": 44.30051290026543
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform.",
    "porchWidthFraction": 0.95,
    "porchDepthMetres": 1.7,
    "porchHeightMetres": 2.6,
    "frontGarden": {
      "depthMetres": 8.5,
      "pathFraction": 0.5,
      "pathWidthMetres": 1.2,
      "lawnColor": "#65754b",
      "hedge": false,
      "evidenceFrame": "0146_RIGHT_SIDE.jpg",
      "accuracy": "Visual estimate from footage, clipped to existing mapped clear ground."
    },
    "frontageReview": {
      "frame": "0146_RIGHT_SIDE.jpg",
      "sha256": "73336f350c2eb4bf11b10a564f35abf5df0da2ef1691911c7b05dd9c12fa2590",
      "method": "Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed."
    }
  },
  {
    "id": "way/1006575704",
    "label": "S03",
    "name": "219 Sherbrooke balcony frontage",
    "confidence": "partial",
    "height": 8.68,
    "eaveHeight": 6.38,
    "roof": "gable",
    "roofRise": 2.3,
    "wallColor": "#894b43",
    "roofColor": "#3b5248",
    "trimColor": "#eee8dc",
    "levels": 2,
    "windowColumns": 3,
    "style": "house",
    "features": [
      "white-upper-balcony",
      "front-porch"
    ],
    "signText": null,
    "notes": "Front appearance revised from the ordered original footage on 2026-10-21. Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed.",
    "reference": {
      "file": "references/0150_RIGHT_SIDE.jpg",
      "sourceSequence": 150,
      "sourceSeconds": 121.754967,
      "sha256": "ee1d90e4803dfe34a9e7f58e2f972823a75c3682ea7e7ad08e02c280b7da73fe"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.32243050095349,
        "lat": 44.30055339958931
      },
      {
        "lon": -78.32234260092609,
        "lat": 44.30055719960654
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform.",
    "frontGarden": {
      "depthMetres": 6,
      "pathFraction": 0.15,
      "pathWidthMetres": 1.1,
      "lawnColor": "#65754b",
      "hedge": false,
      "evidenceFrame": "0150_RIGHT_SIDE.jpg",
      "accuracy": "Visual estimate from footage, clipped to existing mapped clear ground.",
      "drivewayFraction": 0.04,
      "drivewayWidthMetres": 2.2
    },
    "frontageReview": {
      "frame": "0150_RIGHT_SIDE.jpg",
      "sha256": "ee1d90e4803dfe34a9e7f58e2f972823a75c3682ea7e7ad08e02c280b7da73fe",
      "method": "Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed."
    },
    "facadePhoto": {
      "file": "./assets/sherbrooke-frontages/s03.jpg",
      "widthFraction": 1,
      "centerFraction": 0.5,
      "bottomMetres": 0.08,
      "heightMetres": 6.3,
      "gableHeightMetres": 2.3,
      "sha256": "11e5ce3f4ff916895746e0af5d39bdbc31a8836e0ea6f6ac9a889f698434ea87",
      "sourceSha256": "ee1d90e4803dfe34a9e7f58e2f972823a75c3682ea7e7ad08e02c280b7da73fe",
      "sourceFrame": "0150_RIGHT_SIDE.jpg",
      "note": "219 balcony house, third south-side footprint. Gable wings are clipped in geometry. Small fixed porch shrubs remain part of the photographed frontage."
    }
  },
  {
    "id": "way/1006575744",
    "label": "S04",
    "name": "Rectangular brick frontage beside 219",
    "confidence": "partial",
    "height": 7.48,
    "eaveHeight": 6.28,
    "roof": "hip",
    "roofRise": 1.2,
    "wallColor": "#785048",
    "roofColor": "#414641",
    "trimColor": "#eee9dd",
    "levels": 2,
    "windowColumns": 3,
    "style": "house",
    "features": [
      "projecting-entry",
      "wide-ground-window"
    ],
    "signText": null,
    "notes": "Front appearance revised from the ordered original footage on 2026-10-21. Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed.",
    "reference": {
      "file": "references/0150_RIGHT_SIDE.jpg",
      "sourceSequence": 150,
      "sourceSeconds": 121.754967,
      "sha256": "ee1d90e4803dfe34a9e7f58e2f972823a75c3682ea7e7ad08e02c280b7da73fe"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.32228990064606,
        "lat": 44.30054049997325
      },
      {
        "lon": -78.32219240094406,
        "lat": 44.30054470034731
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform.",
    "porch": false,
    "frontGarden": {
      "depthMetres": 7.5,
      "pathFraction": 0.75,
      "pathWidthMetres": 1.1,
      "lawnColor": "#65754b",
      "hedge": false,
      "evidenceFrame": "0154_RIGHT_SIDE.jpg",
      "accuracy": "Visual estimate from footage, clipped to existing mapped clear ground.",
      "drivewayFraction": 0.04,
      "drivewayWidthMetres": 2.2
    },
    "frontageReview": {
      "frame": "0154_RIGHT_SIDE.jpg",
      "sha256": "957539ccd7258c915620d0a20f60e659d21960852832e2ca36ada8a53ac0740b",
      "method": "Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed."
    },
    "facadePhoto": {
      "file": "./assets/sherbrooke-frontages/s04.jpg",
      "widthFraction": 1,
      "centerFraction": 0.5,
      "bottomMetres": 0.08,
      "heightMetres": 6.2,
      "gableHeightMetres": 0,
      "sha256": "db37002f55f23f4c98723d64feafd6410c6ccc1bd6012fe2b28e65e857be3464",
      "sourceSha256": "957539ccd7258c915620d0a20f60e659d21960852832e2ca36ada8a53ac0740b",
      "sourceFrame": "0154_RIGHT_SIDE.jpg",
      "note": "Two-storey rectangular brick front; hipped roof remains real geometry."
    }
  },
  {
    "id": "way/1006575743",
    "label": "S05",
    "name": "Brick house with curved white porch",
    "confidence": "partial",
    "height": 8.38,
    "eaveHeight": 6.38,
    "roof": "gable",
    "roofRise": 2,
    "wallColor": "#854f42",
    "roofColor": "#4c4e4a",
    "trimColor": "#ece9df",
    "levels": 3,
    "windowColumns": 3,
    "style": "house",
    "features": [
      "curved-white-porch",
      "pale-gable-siding"
    ],
    "signText": null,
    "notes": "Front appearance revised from the ordered original footage on 2026-10-21. Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed.",
    "reference": {
      "file": "references/0150_RIGHT_SIDE.jpg",
      "sourceSequence": 150,
      "sourceSeconds": 121.754967,
      "sha256": "ee1d90e4803dfe34a9e7f58e2f972823a75c3682ea7e7ad08e02c280b7da73fe"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.3221501013987,
        "lat": 44.30054949998618
      },
      {
        "lon": -78.32204700158691,
        "lat": 44.300553900171614
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform.",
    "frontGarden": {
      "depthMetres": 7,
      "pathFraction": 0.25,
      "pathWidthMetres": 1.1,
      "lawnColor": "#65754b",
      "hedge": false,
      "evidenceFrame": "0154_RIGHT_SIDE.jpg",
      "accuracy": "Visual estimate from footage, clipped to existing mapped clear ground.",
      "drivewayFraction": 0.96,
      "drivewayWidthMetres": 2.2
    },
    "frontageReview": {
      "frame": "0154_RIGHT_SIDE.jpg",
      "sha256": "957539ccd7258c915620d0a20f60e659d21960852832e2ca36ada8a53ac0740b",
      "method": "Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed."
    },
    "facadePhoto": {
      "file": "./assets/sherbrooke-frontages/s05.jpg",
      "widthFraction": 1,
      "centerFraction": 0.5,
      "bottomMetres": 0.08,
      "heightMetres": 6.3,
      "gableHeightMetres": 2.0,
      "sha256": "3ec3d40b64717b23d255864307679a39c41f9e1ea508278880cf7fefce755080",
      "sourceSha256": "957539ccd7258c915620d0a20f60e659d21960852832e2ca36ada8a53ac0740b",
      "sourceFrame": "0154_RIGHT_SIDE.jpg",
      "note": "White curved porch and pale gable siding. Small edge vegetation remains visible; dimensions estimated."
    }
  },
  {
    "id": "way/1006575703",
    "label": "S06",
    "name": "Brick law-office frontage",
    "confidence": "partial",
    "height": 8.7,
    "eaveHeight": 6.2,
    "roof": "gable",
    "roofRise": 2.1,
    "wallColor": "#884a3e",
    "roofColor": "#414844",
    "trimColor": "#e0d5b9",
    "levels": 2,
    "windowColumns": 3,
    "style": "house",
    "features": [
      "front-gable",
      "front-steps"
    ],
    "signText": null,
    "notes": "Repeated house-row appearance visible in opposite-side frames. Facade-to-footprint registration uncertain; feature geometry intentionally modest.",
    "reference": {
      "file": "references/0170_RIGHT_SIDE.jpg",
      "sourceSequence": 170,
      "sourceSeconds": 136.7366,
      "sha256": "a4cc5469f106a14cc302ce8597fc4387e6d7082d8b1bd5c7b6b013a5f1cfd58d"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.32184310144476,
        "lat": 44.30060949983058
      },
      {
        "lon": -78.3217753013198,
        "lat": 44.30061230011907
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform.",
    "porch": false,
    "frontGarden": {
      "depthMetres": 3.8,
      "pathFraction": 0.5,
      "pathWidthMetres": 1.3,
      "lawnColor": "#65754b",
      "hedge": false,
      "evidenceFrame": "0164_RIGHT_SIDE.jpg",
      "accuracy": "Visual estimate from footage, clipped to existing mapped clear ground."
    },
    "frontageReview": {
      "frame": "0164_RIGHT_SIDE.jpg",
      "sha256": "0b90b8ab7dfcff294c1f15c506b3342c7539d5fc3aff6034df3a2226e03b3dca",
      "method": "Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed."
    }
  },
  {
    "id": "way/1006575741",
    "label": "S07",
    "name": "Westland frontage with lower entrance addition",
    "confidence": "partial",
    "height": 8.6,
    "eaveHeight": 6.2,
    "roof": "gable",
    "roofRise": 2.0,
    "wallColor": "#824b40",
    "roofColor": "#454743",
    "trimColor": "#d8cfb4",
    "levels": 2,
    "windowColumns": 3,
    "style": "house",
    "features": [
      "lower-front-addition",
      "pale-gable-siding"
    ],
    "signText": null,
    "notes": "House forms and roof pitches visible in far-side sequence but screened by trees/utility lines. Approximate facade association follows map order.",
    "reference": {
      "file": "references/0170_RIGHT_SIDE.jpg",
      "sourceSequence": 170,
      "sourceSeconds": 136.7366,
      "sha256": "a4cc5469f106a14cc302ce8597fc4387e6d7082d8b1bd5c7b6b013a5f1cfd58d"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.32168810210611,
        "lat": 44.30061569968606
      },
      {
        "lon": -78.32158950107429,
        "lat": 44.30061990038206
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform.",
    "porch": false,
    "frontGarden": {
      "depthMetres": 3.8,
      "pathFraction": 0.5,
      "pathWidthMetres": 1.2,
      "lawnColor": "#65754b",
      "hedge": false,
      "evidenceFrame": "0168_RIGHT_SIDE.jpg",
      "accuracy": "Visual estimate from footage, clipped to existing mapped clear ground.",
      "drivewayFraction": 0.04,
      "drivewayWidthMetres": 2.2
    },
    "frontageReview": {
      "frame": "0168_RIGHT_SIDE.jpg",
      "sha256": "f3c0b5cbf054630b629f2e41f4be6e119d233a19e9ce3a6dc8b8aeea60a1ebc4",
      "method": "Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed."
    }
  },
  {
    "id": "way/1006575740",
    "label": "S08",
    "name": "Two-storey brick house with dark porch",
    "confidence": "partial",
    "height": 7.48,
    "eaveHeight": 6.28,
    "roof": "hip",
    "roofRise": 1.2,
    "wallColor": "#8b5547",
    "roofColor": "#494c49",
    "trimColor": "#262c2c",
    "levels": 2,
    "windowColumns": 2,
    "style": "house",
    "features": [
      "dark-full-width-porch",
      "right-entry"
    ],
    "signText": null,
    "notes": "Front appearance revised from the ordered original footage on 2026-10-21. Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed.",
    "reference": {
      "file": "references/0170_RIGHT_SIDE.jpg",
      "sourceSequence": 170,
      "sourceSeconds": 136.7366,
      "sha256": "a4cc5469f106a14cc302ce8597fc4387e6d7082d8b1bd5c7b6b013a5f1cfd58d"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.32155350163124,
        "lat": 44.300595900110096
      },
      {
        "lon": -78.3214708013771,
        "lat": 44.30059939981314
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform.",
    "frontGarden": {
      "depthMetres": 5.5,
      "pathFraction": 0.23,
      "pathWidthMetres": 1.1,
      "lawnColor": "#65754b",
      "hedge": false,
      "evidenceFrame": "0170_RIGHT_SIDE.jpg",
      "accuracy": "Visual estimate from footage, clipped to existing mapped clear ground.",
      "drivewayFraction": 0.04,
      "drivewayWidthMetres": 2.2
    },
    "frontageReview": {
      "frame": "0170_RIGHT_SIDE.jpg",
      "sha256": "a4cc5469f106a14cc302ce8597fc4387e6d7082d8b1bd5c7b6b013a5f1cfd58d",
      "method": "Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed."
    },
    "facadePhoto": {
      "file": "./assets/sherbrooke-frontages/s08.jpg",
      "widthFraction": 1,
      "centerFraction": 0.5,
      "bottomMetres": 0.08,
      "heightMetres": 6.2,
      "gableHeightMetres": 0,
      "sha256": "e743bcae3b68e1d2fbcfcb4d24059657201104d341af3e21dce08933a153b2ce",
      "sourceSha256": "a4cc5469f106a14cc302ce8597fc4387e6d7082d8b1bd5c7b6b013a5f1cfd58d",
      "sourceFrame": "0170_RIGHT_SIDE.jpg",
      "note": "Black trim and deep porch; small fixed entrance sign remains at the lower edge, not a moving object."
    }
  },
  {
    "id": "way/1006575739",
    "label": "S09",
    "name": "Brick house with white porch and upper balcony",
    "confidence": "partial",
    "height": 8.6,
    "eaveHeight": 6.3,
    "roof": "gable",
    "roofRise": 2.3,
    "wallColor": "#8f564b",
    "roofColor": "#464743",
    "trimColor": "#e8e3d7",
    "levels": 2,
    "windowColumns": 3,
    "style": "house",
    "features": [
      "white-upper-balcony",
      "white-front-porch"
    ],
    "signText": null,
    "notes": "Front appearance revised from the ordered original footage on 2026-10-21. Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed.",
    "reference": {
      "file": "references/0180_RIGHT_SIDE.jpg",
      "sourceSequence": 180,
      "sourceSeconds": 144.2441,
      "sha256": "f02e1ebdc134cc81a379a15d41cb00e682d0d2b19ef43e14312409b25f78f9f7"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.32141840237648,
        "lat": 44.300592899596815
      },
      {
        "lon": -78.32133470187938,
        "lat": 44.3005964998394
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform.",
    "porchWidthFraction": 0.95,
    "porchDepthMetres": 1.8,
    "porchHeightMetres": 2.7,
    "frontGarden": {
      "depthMetres": 6,
      "pathFraction": 0.8,
      "pathWidthMetres": 1.2,
      "lawnColor": "#65754b",
      "hedge": true,
      "evidenceFrame": "0174_RIGHT_SIDE.jpg",
      "accuracy": "Visual estimate from footage, clipped to existing mapped clear ground.",
      "drivewayFraction": 0.96,
      "drivewayWidthMetres": 2.2
    },
    "frontageReview": {
      "frame": "0174_RIGHT_SIDE.jpg",
      "sha256": "31d7c69f52c2417c87aaed54482181a9954cd87c0e3bb9ff855bba931362816d",
      "method": "Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed."
    }
  },
  {
    "id": "way/1006575702",
    "label": "S10",
    "name": "Blue-sided gable house with glazed porch",
    "confidence": "partial",
    "height": 6.68,
    "eaveHeight": 4.58,
    "roof": "gable",
    "roofRise": 2.1,
    "wallColor": "#8b9ca5",
    "roofColor": "#454b4c",
    "trimColor": "#efeee6",
    "levels": 2,
    "windowColumns": 3,
    "style": "house",
    "features": [
      "blue-horizontal-siding",
      "white-glazed-porch"
    ],
    "signText": null,
    "notes": "Front appearance revised from the ordered original footage on 2026-10-21. Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed.",
    "reference": {
      "file": "references/0180_RIGHT_SIDE.jpg",
      "sourceSequence": 180,
      "sourceSeconds": 144.2441,
      "sha256": "f02e1ebdc134cc81a379a15d41cb00e682d0d2b19ef43e14312409b25f78f9f7"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.3212665016183,
        "lat": 44.30061260031496
      },
      {
        "lon": -78.32117180252574,
        "lat": 44.30061669986072
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform.",
    "frontGarden": {
      "depthMetres": 5,
      "pathFraction": 0.25,
      "pathWidthMetres": 1.1,
      "lawnColor": "#65754b",
      "hedge": false,
      "evidenceFrame": "0176_RIGHT_SIDE.jpg",
      "accuracy": "Visual estimate from footage, clipped to existing mapped clear ground.",
      "drivewayFraction": 0.04,
      "drivewayWidthMetres": 2.2
    },
    "frontageReview": {
      "frame": "0176_RIGHT_SIDE.jpg",
      "sha256": "1a88e1ef2b2deca76dfd70453041afcfbc5d1ca259196609707a02f383b743ba",
      "method": "Ordered west-to-east footage review matched to existing footprint order and visible setback; not surveyed."
    },
    "facadePhoto": {
      "file": "./assets/sherbrooke-frontages/s10.jpg",
      "widthFraction": 1,
      "centerFraction": 0.5,
      "bottomMetres": 0.08,
      "heightMetres": 4.5,
      "gableHeightMetres": 2.1,
      "sha256": "8e4469b08876a63a0ed054eb3203aa6060699b79b3c57dbb6cdaeb87402e991c",
      "sourceSha256": "1a88e1ef2b2deca76dfd70453041afcfbc5d1ca259196609707a02f383b743ba",
      "sourceFrame": "0176_RIGHT_SIDE.jpg",
      "note": "Blue siding, white glazed porch and gabled roof replace the earlier inferred commercial mass."
    }
  },
  {
    "id": "way/1006575733",
    "label": "S11",
    "name": "Sherbrooke south-side commercial row",
    "confidence": "partial",
    "height": 7.2,
    "eaveHeight": 6.8,
    "roof": "flat",
    "roofRise": 0,
    "wallColor": "#a39b89",
    "roofColor": "#59564f",
    "trimColor": "#5c584f",
    "levels": 2,
    "windowColumns": 4,
    "style": "retail",
    "features": [
      "continuous-commercial-frontage"
    ],
    "signText": null,
    "notes": "Longer low commercial frontage appears in late far-side view, with trees/wires masking openings. Sequence-level match, not solved camera registration.",
    "reference": {
      "file": "references/0190_RIGHT_SIDE.jpg",
      "sourceSequence": 190,
      "sourceSeconds": 155.488667,
      "sha256": "dbbd43cb9a3490ecfb4d6529212e74b51ae952c9e44b94395ccd3dff814ac9f1"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.32041930359857,
        "lat": 44.300675800113495
      },
      {
        "lon": -78.32025380303057,
        "lat": 44.300682899914754
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform."
  },
  {
    "id": "way/1006575731",
    "label": "S12",
    "name": "Sherbrooke south-side commercial/service building",
    "confidence": "partial",
    "height": 7.0,
    "eaveHeight": 6.8,
    "roof": "flat",
    "roofRise": 0,
    "wallColor": "#894738",
    "roofColor": "#57544d",
    "trimColor": "#d4c6a7",
    "levels": 2,
    "windowColumns": 7,
    "style": "retail",
    "features": [],
    "signText": null,
    "notes": "Full original recording resolves two levels, dark red cladding/brick, pale continuous fascia, narrow upper openings and ground-level shop windows. Individual shop signs not asserted.",
    "reference": {
      "file": "VID_20261018_073202_00_001.insv",
      "sourceSeconds": 534,
      "lens": 0,
      "sourceFrameSha256": "9faef6b8b11ee82603a66767cb220dc6646e49113173f0a47b9c218baac3198a",
      "neighborSeconds": [
        528,
        540
      ],
      "projection": "FisheyeReframer 2048px / 100deg; existing experimental calibration"
    },
    "texturePatch": null,
    "frontLatLon": [
      {
        "lon": -78.32017120372117,
        "lat": 44.3006820998269
      },
      {
        "lon": -78.319827303158,
        "lat": 44.300696800455356
      }
    ],
    "frontSource": "Ordered frontage endpoints converted from reference block.json to geographic coordinates for the existing project() transform.",
    "windowWidthMetres": 0.65,
    "windowHeightMetres": 0.95,
    "facadePanels": [
      {
        "fraction": 0.5,
        "bottomMetres": 2.5,
        "widthFraction": 1,
        "heightMetres": 0.8,
        "color": "#d0c5a2",
        "outsetMetres": 0.16
      }
    ]
  }
, ...VIDEO_BUILDING_PROFILES,
  ...ROUTE_BUILDING_PROFILES,
  ...WEB_BUILDING_PROFILES].map(profile => [profile.id, profile]));
