import { GLTFLoader } from './vendor/three-r180/examples/jsm/loaders/GLTFLoader.js';

// One cached family, shared by every placed tree. Placement remains survey-owned.
let familyPromise;
const LEVELS = [
  { lod: 0, distance: 0, triangleBudget: 1200 },
  { lod: 1, distance: 85, triangleBudget: 250 },
  { lod: 2, distance: 190, triangleBudget: 60 },
];

async function readLevel(loader, level) {
  const url = new URL(`./assets/vegetation/broadleaf-lod${level.lod}.glb`, import.meta.url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let gltf;
  let geometry;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Vegetation LOD${level.lod}: HTTP ${response.status}`);
    gltf = await loader.parseAsync(await response.arrayBuffer(), new URL('.', url).href);
    gltf.scene.updateMatrixWorld(true);
    const meshes = [];
    gltf.scene.traverse((node) => { if (node.isMesh) meshes.push(node); });
    if (meshes.length !== 1 || Array.isArray(meshes[0].material)) {
      throw new Error('Vegetation asset must contain one mesh and material');
    }
    const mesh = meshes[0];
    geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const positions = geometry.getAttribute('position');
    const colors = geometry.getAttribute('color');
    const triangles = (geometry.index?.count ?? positions.count) / 3;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const bounds = geometry.boundingBox;
    const values = [...positions.array, ...(colors?.array ?? [])];
    if (!colors || colors.count !== positions.count || !mesh.material.vertexColors
        || !values.every(Number.isFinite) || triangles > level.triangleBudget
        || bounds.min.y < -0.1 || bounds.min.y > 0.1
        || bounds.max.y < 6 || bounds.max.y > 10) {
      throw new Error('Vegetation asset failed color, geometry, or Y-up ground-origin validation');
    }
    mesh.geometry.dispose();
    return { ...level, triangles, geometry, material: mesh.material };
  } catch (error) {
    geometry?.dispose();
    gltf?.scene.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry.dispose();
      for (const material of [].concat(node.material)) material.dispose();
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve { lods: [{ lod, distance, geometry, material, triangles }], ... } or null.
 * Meshes and InstancedMeshes must reuse these resources and not dispose them per tree.
 * Callers can retain their procedural trees while loading, or when null is returned.
 */
export function loadVegetationAssets() {
  if (!familyPromise) {
    familyPromise = (async () => {
      const loader = new GLTFLoader();
      const results = await Promise.allSettled(LEVELS.map((level) => readLevel(loader, level)));
      const lods = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
      if (lods.length !== LEVELS.length) {
        for (const lod of lods) { lod.geometry.dispose(); lod.material.dispose(); }
        return null;
      }
      const material = lods[0].material;
      material.name = 'CityVegetationPalette';
      for (const lod of lods.slice(1)) {
        lod.material.dispose();
        lod.material = material;
      }
      return {
        family: 'illustrative-broadleaf',
        provenance: 'Original Blender geometry; inferred appearance, not surveyed species or dimensions.',
        lods,
      };
    })().catch(() => null);
  }
  return familyPromise;
}
