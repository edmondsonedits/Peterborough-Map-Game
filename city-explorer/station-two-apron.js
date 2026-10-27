/** Source-informed paving; GIS terrain remains authoritative beyond the bay apron. */
export function createStationTwoApron({ THREE, layout, worldPoint, surfaceAt, baseSurface, datum }) {
  const group = new THREE.Group();
  group.name = 'Station2_Apron';
  // Original repeatable grain, not a downloaded reference photograph.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d'); const pixels = context.createImageData(256, 256);
  let seed = 4272;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 229 + (seed % 25);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const asphaltCanvas = document.createElement('canvas'); asphaltCanvas.width = asphaltCanvas.height = 256;
  asphaltCanvas.getContext('2d').drawImage(canvas, 0, 0);
  const asphaltTexture = new THREE.CanvasTexture(asphaltCanvas); asphaltTexture.colorSpace = THREE.SRGBColorSpace;
  asphaltTexture.wrapS = asphaltTexture.wrapT = THREE.RepeatWrapping; asphaltTexture.anisotropy = 4;
  context.strokeStyle = 'rgba(70,72,68,0.24)'; context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, 255, 255);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4;
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9bab1, map: texture, roughness: 0.96, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x474b48, map: asphaltTexture, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  function patch(name, minX, maxX, minZ, maxZ, material = concrete) {
    const nx = Math.ceil(maxX - minX), nz = Math.ceil(maxZ - minZ);
    const vertices = [], uvs = [], indices = [];
    for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
      const x = minX + (maxX - minX) * ix / nx, z = minZ + (maxZ - minZ) * iz / nz;
      const world = worldPoint({ x, z });
      const baseHeight = baseSurface(world.x, world.z)?.height ?? datum;
      const height = Math.max(baseHeight, surfaceAt(world.x, world.z)?.height ?? baseHeight);
      vertices.push(x, height - datum + 0.08, z); uvs.push(x / 4, z / 4);
    }
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const a = iz * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1;
      const middle = worldPoint({ x: minX + (maxX - minX) * (ix + 0.5) / nx, z: minZ + (maxZ - minZ) * (iz + 0.5) / nz });
      const source = baseSurface(middle.x, middle.z);
      // Keep the surveyed road and its paint visible at the driveway mouth.
      if (name === 'Marina_driveway' && (source?.official?.layer === 'road_surfaces' || (source?.road?.onRoad && source.road.name === 'Marina Boulevard'))) continue;
      indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.receiveShadow = true; group.add(mesh);
  }
  patch('Bay_concrete_apron', layout.bay.minX, layout.bay.maxX, -5, -0.45);
  patch('Public_entry_walk', layout.apron.minX, layout.bay.minX, -1.5, -0.45);
  patch('Front_asphalt_pad', layout.apron.minX, layout.apron.maxX, -18, -5, asphalt);
  patch('Wing_approach', layout.apron.minX, layout.bay.minX, -5, -1.5, asphalt);
  patch('Bay_side_approach', layout.bay.maxX, layout.apron.maxX, -5, -0.45, asphalt);
  patch('Marina_driveway', -4.5, 4.5, -73, -18, asphalt);
  patch('Rear_apron', -2.9, 8.6, layout.bay.rearZ + 0.4, layout.bay.rearZ + 8);
  return group;
}
