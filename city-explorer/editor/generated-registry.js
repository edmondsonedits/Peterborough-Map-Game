const COORDINATE_DIGITS = 6;

function roundedCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(COORDINATE_DIGITS)) : value;
}

function canonicalGeometry(geometry) {
  if (Array.isArray(geometry)) return geometry.map(canonicalGeometry);
  if (typeof geometry === 'number') return roundedCoordinate(geometry);
  if (geometry && typeof geometry === 'object') {
    return Object.fromEntries(Object.keys(geometry).sort().map((key) => [key, canonicalGeometry(geometry[key])]));
  }
  return geometry;
}

function hashText(text) {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  return seeds.map((seed, index) => {
    let hash = seed >>> 0;
    for (let offset = 0; offset < text.length; offset += 1) {
      hash ^= text.charCodeAt(offset) + index * 17;
      hash = Math.imul(hash, 0x01000193) >>> 0;
      hash = (hash ^ (hash >>> 13)) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }).join('');
}

function uuidFromText(text) {
  const hex = hashText(text).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

export function makeGeneratedId({ sourceType, sourceId, sourceSubId, geometry } = {}) {
  const type = String(sourceType || 'generated').trim().toLowerCase();
  const subId = sourceSubId === undefined || sourceSubId === null ? '' : `:part:${String(sourceSubId).trim()}`;
  if (sourceId !== undefined && sourceId !== null && String(sourceId).trim()) {
    return uuidFromText(`city-generated:v1:${type}:source:${String(sourceId).trim()}${subId}`);
  }
  if (geometry === undefined || geometry === null) throw new TypeError('Generated identity requires a sourceId or geometry.');
  return uuidFromText(`city-generated:v1:${type}:geometry:${JSON.stringify(canonicalGeometry(geometry))}${subId}`);
}

function cloneInstanceMatrix(object, index) {
  if (typeof object.getMatrixAt !== 'function') return null;
  const matrix = object.userData?.cityEditorMatrixFactory?.() ?? object.matrix?.clone?.() ?? {};
  object.getMatrixAt(index, matrix);
  return matrix.clone?.() ?? structuredClone(matrix);
}

export function createGeneratedRegistry(THREE = {}) {
  const records = new Map();
  const appliedReplacementIds = new Set();
  const attachedInstanceParts = new WeakMap();
  const hiddenTargets = new Set();

  function prepareInstanceObject(object) {
    if (!object || typeof object.setColorAt !== 'function') return;
    object.userData ||= {};
    if (THREE.Matrix4) object.userData.cityEditorMatrixFactory ||= () => new THREE.Matrix4();
    if (THREE.Color) object.userData.cityEditorColorFactory ||= () => new THREE.Color();
  }

  function setInstanceColor(object, index, color) {
    if (!object?.instanceColor && Number.isInteger(object?.count) && object.count > 0 && color?.constructor) {
      const white = new color.constructor(0xffffff);
      for (let instance = 0; instance < object.count; instance += 1) object.setColorAt(instance, white);
    }
    object.setColorAt(index, color);
    if (object.instanceColor) object.instanceColor.needsUpdate = true;
  }

  function registerEditableObject(object, metadata = {}) {
    if (!object || typeof object !== 'object') throw new TypeError('An editable generated object is required.');
    const id = metadata.id || makeGeneratedId(metadata);
    const parts = (metadata.parts || [{ object, instanceIndex: metadata.instanceIndex }]).map((part) => ({
      object: part.object,
      instanceIndex: Number.isInteger(part.instanceIndex) ? part.instanceIndex : null,
    }));
    parts.forEach((part) => { if (part.instanceIndex !== null) prepareInstanceObject(part.object); });
    const record = {
      id,
      assetKey: metadata.assetKey || String(metadata.sourceType || 'generated'),
      label: metadata.label || metadata.name || String(metadata.sourceType || 'Generated asset'),
      visible: metadata.visible !== false,
      properties: { ...(metadata.properties || {}) },
      transform: metadata.transform || null,
      sourceType: String(metadata.sourceType || 'generated'),
      sourceId: metadata.sourceId === undefined ? null : String(metadata.sourceId),
      sourceSubId: metadata.sourceSubId === undefined ? null : String(metadata.sourceSubId),
      geometry: metadata.geometry,
      instanceIndex: Number.isInteger(metadata.instanceIndex) ? metadata.instanceIndex : null,
      parts: parts.map((part) => ({
        ...part,
        sourceVisible: part.object.visible !== false,
        sourceMaterial: part.object.material,
        sourceMaterials: (() => {
          const entries = [];
          const add = (node) => { if (node?.material !== undefined) entries.push([node, node.material]); };
          if (typeof part.object.traverse === 'function') part.object.traverse(add);
          else add(part.object);
          return entries;
        })(),
        sourceMatrix: part.instanceIndex === null ? null : cloneInstanceMatrix(part.object, part.instanceIndex),
        sourceColor: part.instanceIndex !== null && typeof part.object.setColorAt === 'function'
          ? (() => {
            const color = part.object.userData?.cityEditorColorFactory?.() || { r: 1, g: 1, b: 1 };
            if (part.object.instanceColor && part.object.getColorAt) part.object.getColorAt(part.instanceIndex, color);
            return color.clone?.() ?? { r: color.r, g: color.g, b: color.b };
          })()
          : null,
      })),
      canTransform: metadata.canTransform !== false,
      batchBinding: metadata.batchBinding || null,
      object,
      sourceVisible: object.visible !== false,
      sourceMaterial: object.material,
      sourceMatrix: Number.isInteger(metadata.instanceIndex) ? cloneInstanceMatrix(object, metadata.instanceIndex) : null,
    };
    if (records.has(id)) {
      const previous = records.get(id);
      const partsMatch = previous.parts.length === record.parts.length
        && previous.parts.every((part, index) => part.object === record.parts[index].object && part.instanceIndex === record.parts[index].instanceIndex);
      if (previous.object !== object || previous.instanceIndex !== record.instanceIndex || !partsMatch) {
        throw new Error(`Generated asset identity collision: ${id}`);
      }
      return id;
    }
    records.set(id, record);
    object.userData ||= {};
    object.userData.cityEditorRecords ||= [];
    object.userData.cityEditorRecords.push({ id, assetKey: record.assetKey, label: record.label, sourceType: record.sourceType, sourceId: record.sourceId, canTransform: record.canTransform });
    object.userData.cityEditor = {
      kind: 'generated', id, assetKey: record.assetKey,
      sourceType: record.sourceType, sourceId: record.sourceId,
      instanceIndex: record.instanceIndex, canTransform: record.canTransform,
    };
    for (const part of record.parts) {
      if (part.instanceIndex === null) continue;
      part.object.userData.cityEditorInstances ||= {};
      part.object.userData.cityEditorInstances[part.instanceIndex] = id;
    }
    return id;
  }

  function getEditableRecord(id) {
    const record = records.get(id);
    if (!record) return null;
    const { object, sourceMaterial, sourceMatrix, parts, batchBinding, ...editable } = record;
    return editable;
  }

  function attachEditablePart(id, object, instanceIndex) {
    const record = records.get(id);
    if (!record || !object || !Number.isInteger(instanceIndex)) return false;
    prepareInstanceObject(object);
    let byIndex = attachedInstanceParts.get(object);
    if (!byIndex) {
      byIndex = new Map();
      attachedInstanceParts.set(object, byIndex);
    }
    let part = byIndex.get(instanceIndex);
    if (part) {
      if (!record.parts.includes(part)) record.parts.push(part);
      part.owners.add(id);
      object.userData ||= {};
      object.userData.cityEditorInstances ||= {};
      object.userData.cityEditorInstances[instanceIndex] = [...part.owners];
      return true;
    }
    if (record.parts.some((existing) => existing.object === object && existing.instanceIndex === instanceIndex)) return true;
    const sourceColor = typeof object.setColorAt === 'function'
      ? (() => {
        const color = object.userData?.cityEditorColorFactory?.() || { r: 1, g: 1, b: 1 };
        if (object.instanceColor && object.getColorAt) object.getColorAt(instanceIndex, color);
        return color.clone?.() ?? { r: color.r, g: color.g, b: color.b };
      })()
      : null;
    part = {
      object, instanceIndex,
      owners: new Set([id]),
      sourceVisible: object.visible !== false,
      sourceMaterial: object.material,
      sourceMaterials: [],
      sourceMatrix: cloneInstanceMatrix(object, instanceIndex),
      sourceColor,
    };
    byIndex.set(instanceIndex, part);
    record.parts.push(part);
    object.userData ||= {};
    object.userData.cityEditorInstances ||= {};
    object.userData.cityEditorInstances[instanceIndex] = [...part.owners];
    return true;
  }

  function restore(id) {
    const record = records.get(id);
    if (!record) return false;
    record.batchBinding?.restore?.();
    record.object.visible = record.sourceVisible;
    record.object.material = record.sourceMaterial;
    record.parts.forEach((part) => {
      if (part.instanceIndex === null) {
        part.object.visible = part.sourceVisible;
        part.sourceMaterials.forEach(([object, material]) => { object.material = material; });
      } else if (part.sourceMatrix && typeof part.object.setMatrixAt === 'function') {
        const matrix = part.sourceMatrix.clone?.() ?? structuredClone(part.sourceMatrix);
        part.object.setMatrixAt(part.instanceIndex, matrix);
        if (part.object.instanceMatrix) part.object.instanceMatrix.needsUpdate = true;
      }
      if (part.instanceIndex !== null && part.sourceColor && typeof part.object.setColorAt === 'function') {
        setInstanceColor(part.object, part.instanceIndex, part.sourceColor);
      }
    });
    return true;
  }

  function hide(id) {
    const record = records.get(id);
    if (!record) return false;
    hiddenTargets.add(id);
    if (record.batchBinding) {
      record.batchBinding.setVisible(false);
      record.object.visible = false;
    }
    let success = true;
    record.parts.forEach((part) => {
      if (part.instanceIndex === null) {
        part.object.visible = false;
      } else {
        if (part.owners && [...part.owners].some((owner) => !hiddenTargets.has(owner))) {
          const matrix = part.sourceMatrix?.clone?.() ?? (part.sourceMatrix ? structuredClone(part.sourceMatrix) : null);
          if (matrix && typeof part.object.setMatrixAt === 'function') {
            part.object.setMatrixAt(part.instanceIndex, matrix);
            if (part.object.instanceMatrix) part.object.instanceMatrix.needsUpdate = true;
          }
          return;
        }
        const matrix = part.sourceMatrix?.clone?.() ?? (part.sourceMatrix ? structuredClone(part.sourceMatrix) : null);
        if (!matrix || typeof part.object.setMatrixAt !== 'function') { success = false; return; }
        if (Array.isArray(matrix.elements)) {
          [0, 1, 2, 4, 5, 6, 8, 9, 10].forEach((element) => { matrix.elements[element] = 0; });
        } else if (matrix.value?.scale) {
          matrix.value.scale = [0, 0, 0];
        } else if (matrix.scale?.setScalar) {
          matrix.scale.setScalar(0);
        } else {
          success = false;
          return;
        }
        part.object.setMatrixAt(part.instanceIndex, matrix);
        if (part.object.instanceMatrix) part.object.instanceMatrix.needsUpdate = true;
      }
    });
    return success;
  }

  function setAppearance(id, appearance, adapter = {}) {
    const record = records.get(id);
    if (!record) return false;
    if (record.batchBinding) {
      const batchAppearance = { ...appearance };
      if (batchAppearance.color === undefined && batchAppearance.materialKey && adapter.materials?.[batchAppearance.materialKey]?.color) {
        batchAppearance.color = adapter.materials[batchAppearance.materialKey].color.getHex?.() ?? adapter.materials[batchAppearance.materialKey].color.value;
      }
      return record.batchBinding.setAppearance(batchAppearance);
    }
    if (record.instanceIndex !== null || record.parts.some((part) => part.instanceIndex !== null)) {
      if (record.parts.some((part) => part.instanceIndex === null)) return false;
      let color = appearance?.color;
      if (color === undefined && appearance?.materialKey && adapter.materials?.[appearance.materialKey]?.color) {
        color = adapter.materials[appearance.materialKey].color.getHex?.() ?? adapter.materials[appearance.materialKey].color.value;
      }
      if (color !== undefined && record.object.setColorAt && adapter.THREE?.Color) {
        record.parts.forEach((part) => {
          setInstanceColor(part.object, part.instanceIndex, new adapter.THREE.Color(color));
        });
        return true;
      }
      return false;
    }
    for (const part of record.parts) {
      const materialObjects = [];
      const addMaterialObject = (object) => { if (object?.material !== undefined) materialObjects.push(object); };
      if (typeof part.object.traverse === 'function') part.object.traverse(addMaterialObject);
      else addMaterialObject(part.object);
      for (const materialObject of materialObjects) {
        const current = materialObject.material;
        const materials = Array.isArray(current) ? current : [current];
        const cloned = materials.map((material) => material?.clone?.() ?? material);
        if (appearance?.materialKey && adapter.materials?.[appearance.materialKey]) {
          const replacement = adapter.materials[appearance.materialKey].clone?.() ?? adapter.materials[appearance.materialKey];
          for (const material of cloned) material?.dispose?.();
          materialObject.material = Array.isArray(current) ? cloned.map(() => replacement.clone?.() ?? replacement) : replacement;
        } else {
          materialObject.material = Array.isArray(current) ? cloned : cloned[0];
        }
        const targets = Array.isArray(materialObject.material) ? materialObject.material : [materialObject.material];
        for (const material of targets) {
          if (!material) continue;
          if (appearance?.color !== undefined && material.color?.set) material.color.set(appearance.color);
          else if (appearance?.color !== undefined && material.color) material.color.value = appearance.color;
          if (appearance?.opacity !== undefined) {
            material.opacity = appearance.opacity;
            material.transparent = appearance.opacity < 1;
            material.needsUpdate = true;
          }
        }
      }
    }
    return true;
  }

  return {
    makeGeneratedId,
    registerEditableObject,
    getEditableRecord,
    attachEditablePart,
    resetOverrides() { hiddenTargets.clear(); },
    restore,
    hide,
    setAppearance,
    records,
    appliedReplacementIds,
  };
}

const defaultRegistry = createGeneratedRegistry();
export const registerEditableObject = defaultRegistry.registerEditableObject;
export const getEditableRecord = defaultRegistry.getEditableRecord;
export const generatedRegistry = defaultRegistry;
