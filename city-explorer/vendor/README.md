# Pinned browser runtime

Peterborough Explorer deliberately ships the small set of browser runtime files it needs. This makes the city model load without relying on a third-party CDN.

## Three.js 0.180.0

Source: <https://www.npmjs.com/package/three/v/0.180.0>

- `three-r180/build/three.module.min.js`
- `three-r180/build/three.core.min.js`
- `three-r180/examples/jsm/utils/BufferGeometryUtils.js`
- `three-r180/examples/jsm/postprocessing/Pass.js`
- `three-r180/LICENSE`

Licensed under MIT. The application maps the bare `three` module specifier to the local minified ES module in `../index.html`.

Pinned SHA-256:

- `three.module.min.js`: `e2b5ee6bccd38fd6d8a2428546b83c5f2426d84b152ef82be8055556e3b40eb6`
- `BufferGeometryUtils.js`: `fda7e946b8e0b5ab39b779206589e7a1079a22eb24efb89d7223e03fdfb1f751`
- `Pass.js`: `444b409c235ead986893c472e720da1b779a56985c7d10b279c7944b52bd61c5`

## Spark 2.1.0

Source: <https://www.npmjs.com/package/@sparkjsdev/spark/v/2.1.0>

- `spark-2.1.0/spark.module.min.js`
- `spark-2.1.0/LICENSE`
- `spark-2.1.0/package.json`

Licensed under MIT. Spark is lazy-loaded only for approved, in-range captured-detail assets or an explicit QA preflight. Its `three >=0.180.0` peer requirement is the reason the shared runtime is pinned to r180.

Pinned SHA-256: `8d26ea30315f4b17e6c980dd2e7319e5a238ff5fd0c73c60768df602fe9456fe`

## osmtogeojson 3.0.0-beta.5

Source: <https://www.npmjs.com/package/osmtogeojson/v/3.0.0-beta.5>

- `osmtogeojson-3.0.0-beta.5/osmtogeojson.js`
- `osmtogeojson-3.0.0-beta.5/LICENSE`

Licensed under MIT. The unmodified browser build preserves multipolygon and courtyard support for the cached city extract.

Pinned SHA-256: `663bb5bbae47d5d12bff9cf1c87b8f973e85fab4b1f83453810aae99add54592`
