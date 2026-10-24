import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { ASSET_CATALOG } from './asset-catalog.js';
import { createEmptySceneDocument } from './scene-document.js';
import { createGeneratedReplacementDocument, isProtectedEditorTarget, pickEditorSelection } from './city-editor-selection.js';
import { cancelTransformControlDrag, rebindEditorSelection } from './editor-interactions.js';
import { createEditorCameraNavigation } from './editor-camera-navigation.js';
import { restoreEditorCameraSession, startEditorCameraSession } from './editor-camera-session.js';
import { createVersionSaver } from './version-saver.js?v=1.6.127';
import { authorizeEditorEntry } from './editor-entry.js';
import { createRecoveryPrompt } from './recovery-prompt.js?v=1.6.127';
import { createAIEditorTools } from './ai-editor-tools.js?v=1.6.127';
import { createAIEditorCamera } from './ai-editor-camera.js?v=1.6.127';
import { installAIEditorPanel } from './ai-editor-panel.js?v=1.6.127';
import { editorFeatureBounds } from './ai-editor-bounds.js?v=1.6.127';

export { createGeneratedReplacementDocument, isProtectedEditorTarget, pickEditorSelection } from './city-editor-selection.js';

const CATALOG_KEYS = Object.keys(ASSET_CATALOG);
const clampScale = (value) => Math.max(0.05, Number(value) || 0.05);

function reconcileEditorPanels({ narrow, assetsOpen, inspectorOpen, lastOpenedPanel = 'inspector', entering = false }) {
  if (entering) return narrow
    ? { assetsOpen: false, inspectorOpen: false }
    : { assetsOpen: true, inspectorOpen: true };
  if (narrow && assetsOpen && inspectorOpen) {
    return lastOpenedPanel === 'assets'
      ? { assetsOpen: true, inspectorOpen: false }
      : { assetsOpen: false, inspectorOpen: true };
  }
  return { assetsOpen, inspectorOpen };
}

export function createCityEditor(adapter) {
  const {
    THREE, scene, authoredRuntime, generatedRegistry, documentHistory, draftStore,
    raycaster, camera, canvas, hooks = {}, elements = {}, layers = {}, protectedGroups = new Set(),
  } = adapter;
  if (!THREE || !scene || !authoredRuntime || !generatedRegistry || !documentHistory || !draftStore || !raycaster || !camera || !canvas) {
    throw new TypeError('City editor requires its scene, runtimes, history, draft store, raycaster, camera, and canvas.');
  }

  let active = false;
  let disposed = false;
  let previousMode = null;
  let selected = null;
  let pendingAssetKey = null;
  let preview = null;
  let pointerDown = null;
  let gestureSnapshot = null;
  let transform = null;
  let cameraNavigation = null;
  let cameraSnapshot = null;
  let recoveryPrompt = createRecoveryPrompt(null);
  let entryPending = false;
  let transientClone = null;
  let gestureGeneratedRecord = null;
  let lastOpenedPanel = 'inspector';
  let aiTools = null;
  let aiPanel = null;
  const listeners = [];
  const selectionHelpers = new Map();
  const ui = {
    left: elements.left || document.querySelector('#city-editor-left'),
    inspector: elements.inspector || document.querySelector('#city-editor-inspector'),
    toolbar: elements.toolbar || document.querySelector('#city-editor-transform-toolbar'),
    status: elements.status || document.querySelector('#city-editor-status'),
    recovery: elements.recovery || document.querySelector('#city-editor-recovery'),
  };
  const controls = {
    search: ui.left?.querySelector('[data-editor-search]'),
    assets: ui.left?.querySelector('[data-editor-assets]'),
    layers: ui.left?.querySelector('[data-editor-layers]'),
    label: ui.inspector?.querySelector('[data-editor-label]'),
    fields: [...(ui.inspector?.querySelectorAll('[data-transform-field]') || [])],
    selectedName: ui.inspector?.querySelector('[data-editor-selected]'),
    statusText: ui.status?.querySelector('[data-editor-status-text]'),
    statusCount: ui.status?.querySelector('[data-editor-count]'),
    undo: ui.status?.querySelector('[data-editor-undo]'),
    redo: ui.status?.querySelector('[data-editor-redo]'),
    saveVersion: ui.status?.querySelector('[data-editor-save-version]'),
  };
  const publisherUrl = globalThis.CITY_EDITOR_PUBLISHER_URL || document.querySelector('meta[name="city-editor-publisher"]')?.content;
  const versionSaver = createVersionSaver({
    serviceUrl: publisherUrl,
    publishedDocument: documentHistory.current,
    draftStore,
    onState({ name, commitSha, reason, deploymentStatus, localDraftRecoveryUnavailable }) {
      const version = commitSha || '';
      const messages = {
        saved: deploymentStatus === 'unavailable'
          ? `Version saved (${version}); deployment status unavailable`
          : `Version saved (${version}); deployment pending`,
        deploying: `Version ${version} is deploying`,
        live: `Version ${version} is live`,
        conflict: 'Published city changed; your local draft is safe. Reload and reconcile before saving.',
        'auth-expired': 'Owner sign-in required; your local draft is safe.',
        failed: reason === 'local-draft' ? 'Local draft could not be saved; check browser storage.'
          : reason === 'unconfigured' ? 'Publisher not configured; local draft is safe. Download/Export JSON remains available.'
            : 'Version save failed; your local draft is safe.',
      };
      setStatus(localDraftRecoveryUnavailable
        ? `Published version saved (${version}); local draft recovery is unavailable for newer edits. Download/Export JSON remains available.`
        : messages[name] || 'Saving version…');
    },
  });

  function addListener(target, type, callback, options) {
    target?.addEventListener(type, callback, options);
    listeners.push(() => target?.removeEventListener(type, callback, options));
  }

  function currentDocument() {
    return documentHistory.current || createEmptySceneDocument();
  }

  function documentWith(change) {
    const current = currentDocument();
    const next = { ...current, ...change, updatedAt: new Date().toISOString() };
    documentHistory.execute('Edit city', next);
    if (selected?.kind === 'authored') rebindSelectionToLiveRuntime();
    return currentDocument();
  }

  function recordFor(id, tag = null) {
    const authored = currentDocument().objects.find((record) => record.id === id);
    if (authored) return { ...authored, kind: 'authored', object: authoredRuntime.getObject(id), canTransform: true };
    const generated = generatedRegistry.getEditableRecord(id);
    if (!generated) return null;
    return { ...generated, kind: 'generated', ...tag, object: tag?.object || generatedRegistry.records.get(id)?.object || generated.object };
  }

  function allRecords() {
    const authored = currentDocument().objects.map((record) => ({ ...record, kind: 'authored' }));
    const generated = [...generatedRegistry.records.values()].map(({ object, ...record }) => ({ ...record, kind: 'generated' }));
    return [...authored, ...generated];
  }

  function setStatus(message) {
    if (controls.statusText) controls.statusText.textContent = message;
  }

  function syncHistoryButtons() {
    if (controls.undo) controls.undo.disabled = !documentHistory.canUndo;
    if (controls.redo) controls.redo.disabled = !documentHistory.canRedo;
  }

  function transformValue(record, axis) {
    const object = record?.object;
    if (!object) return '';
    const latLon = adapter.toGeographic?.(object.position.x, object.position.z, object.position.y, record);
    const values = {
      longitude: latLon?.longitude,
      latitude: latLon?.latitude,
      elevation: latLon?.elevation,
      rotationX: object.rotation.x,
      rotationY: object.rotation.y,
      rotationZ: object.rotation.z,
      scaleX: object.scale.x,
      scaleY: object.scale.y,
      scaleZ: object.scale.z,
    };
    return Number.isFinite(values[axis]) ? String(Number(values[axis].toFixed(4))) : '';
  }

  function renderInspector() {
    const record = selected && recordFor(selected.id, selected);
    if (!record) {
      if (controls.selectedName) controls.selectedName.textContent = 'No selection';
      if (controls.label) controls.label.value = '';
      controls.fields.forEach((input) => { input.value = ''; input.disabled = true; });
      return;
    }
    if (controls.selectedName) controls.selectedName.textContent = record.label || record.assetKey;
    if (controls.label) controls.label.value = record.label || '';
    controls.fields.forEach((input) => {
      input.disabled = record.kind !== 'authored';
      input.value = transformValue(record, input.dataset.transformField);
    });
  }

  function renderAssets() {
    if (!controls.assets) return;
    const query = controls.search?.value.trim().toLowerCase() || '';
    controls.assets.replaceChildren();
    for (const key of CATALOG_KEYS) {
      const asset = ASSET_CATALOG[key];
      if (query && !`${key} ${asset.label} ${asset.category}`.toLowerCase().includes(query)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.assetKey = key;
      button.textContent = asset.label;
      button.setAttribute('aria-label', `Place ${asset.label}`);
      button.addEventListener('click', () => beginPlacement(key));
      controls.assets.append(button);
    }
  }

  function renderLayers() {
    if (!controls.layers) return;
    controls.layers.replaceChildren();
    for (const [key, group] of Object.entries(layers)) {
      const label = document.createElement('label');
      label.className = 'city-editor-layer';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = group.visible !== false;
      input.addEventListener('change', () => { group.visible = input.checked; });
      const text = document.createElement('span');
      text.textContent = key;
      label.append(input, text);
      controls.layers.append(label);
    }
  }

  function renderStatus() {
    if (controls.statusCount) controls.statusCount.textContent = `${allRecords().length} records`;
    syncHistoryButtons();
  }

  function refreshUI() {
    renderAssets();
    renderLayers();
    renderInspector();
    renderStatus();
  }

  function makeTransformObject(record) {
    if (!record || !record.object || record.canTransform === false) return null;
    return record.object;
  }

  function setSelected(selection) {
    removeTransientClone();
    selected = selection;
    let record = selection && recordFor(selection.id, selection);
    if (record?.kind === 'generated' && record.canTransform !== false) {
      transientClone = generatedRegistry.cloneEditableObject(record.id);
      if (transientClone) {
        transientClone.name = record.label || record.assetKey;
        transientClone.userData ||= {};
        transientClone.userData.cityEditor = { kind: 'generated-preview', id: record.id, canTransform: true };
        transientClone.traverse?.((node) => { node.userData ||= {}; node.userData.cityEditorProtected = false; });
        scene.add(transientClone);
        selected = { ...selection, sourceObject: selection.object, object: transientClone };
        record = recordFor(selection.id, selected);
      }
    }
    const object = makeTransformObject(record);
    if (object && record.canTransform !== false) transform?.attach(object);
    else transform?.detach();
    renderInspector();
    renderStatus();
    setStatus(record ? `${record.label || record.assetKey} selected` : 'Ready');
  }

  function removeTransientClone() {
    if (!transientClone) return;
    scene.remove(transientClone);
    transientClone.traverse?.((node) => {
      node.geometry?.dispose?.();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => material?.dispose?.());
    });
    transientClone = null;
  }

  function removeSelectionHelper() {
    if (!selected) return;
    const helper = selectionHelpers.get(selected.id);
    if (helper) {
      scene.remove(helper);
      selectionHelpers.delete(selected.id);
    }
  }

  function pointer(event) {
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  function intersectEditable(event) {
    raycaster.setFromCamera(pointer(event), camera);
    const roots = [
      ...[...generatedRegistry.records.values()].map((record) => record.object),
      ...currentDocument().objects.map((record) => authoredRuntime.getObject(record.id)).filter(Boolean),
    ];
    const hits = raycaster.intersectObjects(roots, true);
    return pickEditorSelection(hits, (id) => Boolean(recordFor(id)), protectedGroups);
  }

  function intersectGround(event) {
    if (typeof adapter.intersectGround !== 'function') return null;
    return adapter.intersectGround(pointer(event));
  }

  function updatePreview(event) {
    const ground = intersectGround(event);
    if (!ground) return;
    const transformData = adapter.transformFromWorld?.(ground.x, ground.z, ground.y) || {};
    if (!preview) {
      preview = adapter.createPreview?.(pendingAssetKey) || null;
      if (preview) {
        preview.traverse?.((node) => { if (node.material) node.material.transparent = true; });
        preview.scale.multiplyScalar(0.85);
        scene.add(preview);
      }
    }
    preview?.position.set(ground.x, ground.y, ground.z);
    if (preview) preview.userData.cityEditorTransform = transformData;
  }

  function beginPlacement(assetKey) {
    if (!active || !ASSET_CATALOG[assetKey]) return;
    cancelPlacement();
    pendingAssetKey = assetKey;
    setStatus(`Click the terrain to place ${ASSET_CATALOG[assetKey].label}; Escape cancels`);
    canvas.style.cursor = 'crosshair';
  }

  function cancelPlacement() {
    pendingAssetKey = null;
    if (preview) {
      scene.remove(preview);
      preview.traverse?.((node) => node.material?.dispose?.());
      preview = null;
    }
    canvas.style.cursor = '';
  }

  function commitPlacement(event) {
    const ground = intersectGround(event);
    if (!ground || !pendingAssetKey) return false;
    const object = adapter.createPreview?.(pendingAssetKey);
    const transformData = adapter.transformFromWorld?.(ground.x, ground.z, ground.y);
    if (!object || !transformData) return false;
    const id = globalThis.crypto?.randomUUID?.() || `city-editor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const record = {
      id,
      assetKey: pendingAssetKey,
      label: ASSET_CATALOG[pendingAssetKey].label,
      visible: true,
      properties: {},
      transform: { ...transformData, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    };
    const next = currentDocument();
    documentWith({ objects: [...next.objects, record] });
    authoredRuntime.upsert(record);
    setSelected({ id, kind: 'authored', object: authoredRuntime.getObject(id) });
    cancelPlacement();
    refreshUI();
    return true;
  }

  function updateAuthoredTransform(record, patch) {
    if (record?.kind !== 'authored') return false;
    const next = currentDocument();
    const objects = next.objects.map((item) => item.id === record.id ? { ...item, transform: { ...item.transform, ...patch } } : item);
    const updated = documentWith({ objects });
    const value = updated.objects.find((item) => item.id === record.id);
    authoredRuntime.upsert(value);
    setSelected({ ...selected, object: authoredRuntime.getObject(record.id) });
    refreshUI();
    return true;
  }

  function serializeObjectTransform(record) {
    const object = record.object;
    const geographic = adapter.toGeographic?.(object.position.x, object.position.z, object.position.y, record);
    if (!geographic) return null;
    return {
      longitude: geographic.longitude,
      latitude: geographic.latitude,
      elevation: geographic.elevation,
      rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z },
      scale: { x: clampScale(object.scale.x), y: clampScale(object.scale.y), z: clampScale(object.scale.z) },
    };
  }

  function commitTransform() {
    if (!gestureSnapshot || !selected) return;
    const record = recordFor(selected.id, selected);
    const transformData = serializeObjectTransform(record);
    const moved = record?.object && (
      record.object.position.distanceTo(gestureSnapshot.position) > 1e-5
      || record.object.rotation.x !== gestureSnapshot.rotation.x
      || record.object.rotation.y !== gestureSnapshot.rotation.y
      || record.object.rotation.z !== gestureSnapshot.rotation.z
      || record.object.scale.distanceTo(gestureSnapshot.scale) > 1e-5
    );
    if (moved && transformData && gestureGeneratedRecord) {
      const replacementId = generatedRegistry.makeGeneratedId({ sourceType: 'authored-replacement', sourceId: gestureGeneratedRecord.id });
      const next = createGeneratedReplacementDocument(currentDocument(), gestureGeneratedRecord, transformData, replacementId);
      next.updatedAt = new Date().toISOString();
      documentHistory.execute('Transform generated feature', next);
      removeTransientClone();
      setSelected({ id: replacementId, kind: 'authored', object: authoredRuntime.getObject(replacementId) });
      refreshUI();
    } else if (moved && transformData && record.kind === 'authored') {
      updateAuthoredTransform(record, transformData);
    }
    gestureGeneratedRecord = null;
    gestureSnapshot = null;
  }

  function cancelGesture() {
    cancelPlacement();
    cameraNavigation?.end();
    const object = gestureSnapshot && selected ? recordFor(selected.id, selected)?.object : null;
    if (object && gestureSnapshot) {
      object.position.copy(gestureSnapshot.position);
      object.rotation.copy(gestureSnapshot.rotation);
      object.scale.copy(gestureSnapshot.scale);
      object.updateMatrixWorld(true);
    }
    gestureGeneratedRecord = null;
    gestureSnapshot = null;
    cancelTransformControlDrag(transform);
    if (object) transform?.attach(object);
    if (object) setStatus('Transform cancelled');
  }

  function duplicateSelected() {
    if (!selected) return;
    const record = recordFor(selected.id, selected);
    if (record?.kind !== 'authored') { setStatus('Only authored assets can be duplicated'); return; }
    const copy = { ...record, id: globalThis.crypto?.randomUUID?.() || `city-editor-${Date.now()}`, label: `${record.label} copy`, properties: { ...record.properties }, transform: { ...record.transform, longitude: record.transform.longitude + 0.00002, latitude: record.transform.latitude + 0.00002 } };
    const documentValue = currentDocument();
    documentWith({ objects: [...documentValue.objects, copy] });
    authoredRuntime.upsert(copy);
    setSelected({ id: copy.id, kind: 'authored', object: authoredRuntime.getObject(copy.id) });
    refreshUI();
  }

  function hideOrDeleteSelected() {
    if (!selected) return;
    const record = recordFor(selected.id, selected);
    if (!record) return;
    if (record.kind === 'authored') {
      const documentValue = currentDocument();
      const objects = documentValue.objects.map((item) => item.id === record.id ? { ...item, visible: false } : item);
      documentWith({ objects });
    } else {
      const documentValue = currentDocument();
      const overrides = documentValue.overrides.filter((item) => item.id !== record.id);
      documentWith({ overrides: [...overrides, { id: record.id, operation: 'hide' }] });
      generatedRegistry.hide(record.id);
    }
    setStatus(`${record.label || record.assetKey} hidden · Restore to show it again`);
    refreshUI();
  }

  function restoreSelected() {
    if (!selected) return;
    const record = recordFor(selected.id, selected);
    if (!record) return;
    const documentValue = currentDocument();
    if (record.kind === 'authored') {
      documentWith({ objects: documentValue.objects.map((item) => item.id === record.id ? { ...item, visible: true } : item) });
    } else {
      generatedRegistry.restore(record.id);
      documentWith({ overrides: documentValue.overrides.filter((item) => item.id !== record.id) });
    }
    setStatus('Asset restored');
    refreshUI();
  }

  function undo() {
    if (documentHistory.undo()) {
      const documentValue = currentDocument();
      authoredRuntime.load(documentValue);
      adapter.applyOverrides?.(documentValue);
      rebindSelectionToLiveRuntime();
      refreshUI();
      return true;
    }
    return false;
  }

  function redo() {
    if (documentHistory.redo()) {
      const documentValue = currentDocument();
      authoredRuntime.load(documentValue);
      adapter.applyOverrides?.(documentValue);
      rebindSelectionToLiveRuntime();
      refreshUI();
      return true;
    }
    return false;
  }

  function rebindSelectionToLiveRuntime() {
    if (!selected) return;
    const nextSelection = rebindEditorSelection(selected, (id) => recordFor(id));
    if (nextSelection) setSelected(nextSelection);
    else setSelected(null);
  }

  function setPanelOpen(name, open) {
    if (open) lastOpenedPanel = name;
    const narrow = globalThis.matchMedia?.('(max-width: 760px)').matches || false;
    const current = {
      assetsOpen: !!ui.left && !ui.left.hidden,
      inspectorOpen: !!ui.inspector && !ui.inspector.hidden,
    };
    const next = reconcileEditorPanels({
      narrow,
      ...current,
      ...(name === 'assets' ? { assetsOpen: open } : { inspectorOpen: open }),
      lastOpenedPanel,
    });
    applyPanelOpen('assets', next.assetsOpen);
    applyPanelOpen('inspector', next.inspectorOpen);
  }

  function applyPanelOpen(name, open) {
    const panel = name === 'assets' ? ui.left : ui.inspector;
    const toggle = ui.toolbar?.querySelector(`[data-editor-panel-toggle="${name}"]`);
    if (!panel || !toggle) return;
    panel.hidden = !open;
    panel.inert = !open;
    toggle.setAttribute('aria-pressed', String(open));
    document.documentElement.classList.toggle(`editor-panel-${name}-open`, open);
  }

  function syncPanelLayout({ entering = false } = {}) {
    const isMobile = globalThis.matchMedia?.('(max-width: 760px)').matches || false;
    const next = reconcileEditorPanels({
      narrow: isMobile,
      assetsOpen: !!ui.left && !ui.left.hidden,
      inspectorOpen: !!ui.inspector && !ui.inspector.hidden,
      lastOpenedPanel,
      entering,
    });
    applyPanelOpen('assets', next.assetsOpen);
    applyPanelOpen('inspector', next.inspectorOpen);
  }

  function handleShortcut(event) {
    if (!active) return false;
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return false;
    if (event.code === 'Escape') { event.preventDefault(); cancelGesture(); return true; }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') { event.preventDefault(); event.shiftKey ? redo() : undo(); return true; }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyY') { event.preventDefault(); redo(); return true; }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyD') { event.preventDefault(); duplicateSelected(); return true; }
    if (event.code === 'Delete' || event.code === 'Backspace') { event.preventDefault(); hideOrDeleteSelected(); return true; }
    const modes = { KeyG: 'translate', KeyR: 'rotate', KeyS: 'scale' };
    if (!event.ctrlKey && modes[event.code]) { transform?.setMode(modes[event.code]); syncToolbarMode(modes[event.code]); event.preventDefault(); return true; }
    return false;
  }

  function syncToolbarMode(mode) {
    ui.toolbar?.querySelectorAll('[data-transform-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.transformMode === mode));
    });
  }

  function onCanvasPointerMove(event) {
    if (!active) return;
    event.stopPropagation();
    if (cameraNavigation?.move(event)) return;
    if (pendingAssetKey) updatePreview(event);
  }

  function onCanvasPointerDown(event) {
    if (!active) return;
    event.stopPropagation();
    if (event.button === 2 && !transform?.dragging && cameraNavigation?.begin(event)) {
      event.preventDefault();
      pointerDown = null;
      return;
    }
    pointerDown = { x: event.clientX, y: event.clientY, transform: transform?.axis !== null && transform?.axis !== undefined };
  }

  function onCanvasPointerUp(event) {
    if (!active) return;
    event.stopPropagation();
    if (cameraNavigation?.end()) {
      return;
    }
    const start = pointerDown;
    pointerDown = null;
    if (!start || start.transform || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    if (pendingAssetKey && commitPlacement(event)) return;
    const selection = intersectEditable(event);
    if (selection) setSelected(selection);
    else setSelected(null);
  }

  function onCanvasWheel(event) {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    cameraNavigation?.zoom(event.deltaY);
  }

  function onCanvasContextMenu(event) {
    if (active) event.preventDefault();
  }

  function saveInspectorTransform() {
    const record = selected && recordFor(selected.id, selected);
    if (!record || record.kind !== 'authored') return;
    const value = {};
    for (const input of controls.fields) {
      const key = input.dataset.transformField;
      const number = Number(input.value);
      if (!Number.isFinite(number)) return;
      if (key === 'longitude' || key === 'latitude' || key === 'elevation') value[key] = number;
      else {
        value.rotation ||= { ...record.transform.rotation };
        value.scale ||= { ...record.transform.scale };
        if (key.startsWith('rotation')) value.rotation[key.slice(8).toLowerCase()] = number;
        if (key.startsWith('scale')) value.scale[key.slice(5).toLowerCase()] = clampScale(number);
      }
    }
    updateAuthoredTransform(record, value);
  }

  function exportDraft() {
    const result = draftStore.exportDraft();
    if (result.status !== 'exported') { setStatus('No saved draft is available to export'); return result; }
    const url = URL.createObjectURL(new Blob([result.data], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'peterborough-city-editor-draft.json';
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Draft exported');
    return result;
  }

  function initialize() {
    if (disposed) throw new Error('City editor has been disposed.');
    transform = new TransformControls(camera, canvas);
    const rect = canvas.getBoundingClientRect();
    cameraNavigation = createEditorCameraNavigation(THREE, camera, { width: rect.width, height: rect.height });
    let viewStorage;
    try { viewStorage = globalThis.localStorage; } catch { /* Session views remain available. */ }
    const aiCamera = createAIEditorCamera({ THREE, camera, navigation: () => cameraNavigation,
      project: adapter.project, heightAt: adapter.terrainHeightAtWorld, storage: viewStorage });
    const aiRecord = (id) => {
      const authored = currentDocument().objects.find(record => record.id === id);
      if (authored) return { ...authored, kind: 'authored', object: authoredRuntime.getObject(id) };
      const generated = generatedRegistry.records.get(id);
      return generated ? { ...generated, kind: 'generated' } : null;
    };
    aiTools = createAIEditorTools({
      isActive: () => active && !disposed,
      isBlocked: () => recoveryPrompt.pending || Boolean(gestureSnapshot || pendingAssetKey || transform?.dragging),
      getDocument: currentDocument,
      getRecord: aiRecord,
      listRecords: function* () {
        for (const record of generatedRegistry.records.values()) yield { ...record, kind: 'generated' };
        for (const record of currentDocument().objects) yield { ...record, kind: 'authored' };
      },
      selectedId: () => selected?.id ?? null,
      select: selectById,
      focus: record => aiCamera.focus(record.object, editorFeatureBounds(THREE, record)),
      bounds(record) {
        if (!record.object) return null;
        const box = editorFeatureBounds(THREE, record);
        return box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() };
      },
      commit(documentValue, label) {
        const changed = documentHistory.execute(label, documentValue);
        if (changed) {
          const replacement = documentValue.objects.find(item => item.properties?.sourceTargetId === selected?.id);
          if (replacement) selectById(replacement.id);
          else rebindSelectionToLiveRuntime();
          refreshUI();
        }
        return changed;
      },
      undo, redo, camera: aiCamera, metadata: () => adapter.aiMetadata?.() || {},
    });
    aiPanel = installAIEditorPanel(ui.inspector?.querySelector('[data-editor-ai-root]'), aiTools);
    raycaster.layers.enable(31);
    // Picking proxies belong to the raycaster only; rendering their invisible
    // materials still submits thousands of building/road draw calls.
    transform.enabled = false;
    transform.getHelper().visible = false;
    scene.add(transform.getHelper());
    transform.addEventListener('mouseDown', () => {
      if (!active || !selected) return;
      const record = recordFor(selected.id, selected);
      const object = record?.object;
      if (!object) return;
      gestureSnapshot = { position: object.position.clone(), rotation: object.rotation.clone(), scale: object.scale.clone() };
      gestureGeneratedRecord = record.kind === 'generated' && record.canTransform !== false ? record : null;
    });
    transform.addEventListener('mouseUp', commitTransform);
    transform.addEventListener('objectChange', () => {
      if (active && selected) renderInspector();
    });
    addListener(canvas, 'pointermove', onCanvasPointerMove);
    addListener(canvas, 'pointerdown', onCanvasPointerDown);
    addListener(canvas, 'pointerup', onCanvasPointerUp);
    addListener(canvas, 'pointercancel', cancelGesture);
    addListener(canvas, 'wheel', onCanvasWheel, { passive: false });
    addListener(canvas, 'contextmenu', onCanvasContextMenu);
    addListener(ui.toolbar, 'click', (event) => {
      const toggle = event.target.closest?.('[data-editor-panel-toggle]');
      if (!toggle) return;
      const name = toggle.dataset.editorPanelToggle;
      setPanelOpen(name, toggle.getAttribute('aria-pressed') !== 'true');
    });
    addListener(globalThis, 'resize', () => { if (active) syncPanelLayout(); });
    addListener(controls.search, 'input', renderAssets);
    addListener(controls.label, 'change', () => {
      if (!selected) return;
      const record = recordFor(selected.id, selected);
      if (record?.kind !== 'authored') return;
      const documentValue = currentDocument();
      const objects = documentValue.objects.map((item) => item.id === record.id ? { ...item, label: controls.label.value.trim() || item.assetKey } : item);
      documentWith({ objects });
      const updated = currentDocument().objects.find((item) => item.id === record.id);
      authoredRuntime.upsert(updated);
      setSelected({ ...selected, object: authoredRuntime.getObject(record.id) });
      refreshUI();
    });
    controls.fields.forEach((input) => addListener(input, 'change', saveInspectorTransform));
    addListener(ui.status?.querySelector('[data-editor-duplicate]'), 'click', duplicateSelected);
    addListener(ui.status?.querySelector('[data-editor-delete]'), 'click', hideOrDeleteSelected);
    addListener(ui.status?.querySelector('[data-editor-restore]'), 'click', restoreSelected);
    addListener(controls.undo, 'click', undo);
    addListener(controls.redo, 'click', redo);
    addListener(controls.saveVersion, 'click', async () => {
      if (controls.saveVersion.disabled) return;
      controls.saveVersion.disabled = true;
      setStatus('Saving local recovery draft…');
      const candidate = { ...currentDocument(), updatedAt: new Date().toISOString() };
      const result = await versionSaver.save(candidate);
      controls.saveVersion.disabled = false;
      if (result.state === 'auth-expired' && publisherUrl) globalThis.location.assign(`${publisherUrl.replace(/\/$/, '')}/auth/github`);
    });
    addListener(ui.status?.querySelector('[data-editor-export]'), 'click', exportDraft);
    addListener(ui.status?.querySelector('[data-editor-exit]'), 'click', exit);
    ui.toolbar?.querySelectorAll('[data-transform-mode]').forEach((button) => addListener(button, 'click', () => {
      transform.setMode(button.dataset.transformMode);
      syncToolbarMode(button.dataset.transformMode);
    }));
    addListener(ui.toolbar?.querySelector('[data-transform-space]'), 'click', (event) => {
      transform.setSpace(transform.space === 'world' ? 'local' : 'world');
      event.currentTarget.setAttribute('aria-pressed', String(transform.space === 'local'));
    });
    addListener(ui.toolbar?.querySelector('[data-transform-snap]'), 'change', (event) => {
      const step = Number(event.currentTarget.value);
      transform.setTranslationSnap(step > 0 ? step : null);
      transform.setRotationSnap(step > 0 ? THREE.MathUtils.degToRad(step) : null);
      transform.setScaleSnap(step > 0 ? step : null);
    });
    const recover = ui.recovery?.querySelector('[data-recovery-action="recover"]');
    const discard = ui.recovery?.querySelector('[data-recovery-action="discard"]');
    addListener(ui.recovery?.querySelector('[data-recovery-action="export"]'), 'click', exportDraft);
    addListener(recover, 'click', () => {
      const draft = draftStore.loadDraft();
      if (draft.document) {
        documentHistory.execute('Recover local draft', draft.document);
        authoredRuntime.load(draft.document);
        adapter.applyOverrides?.(draft.document);
        refreshUI();
      }
      recoveryPrompt.dismiss();
      ui.recovery.close();
    });
    addListener(discard, 'click', () => { draftStore.discardDraft(); recoveryPrompt.dismiss(); ui.recovery.close(); });
    const draft = draftStore.loadDraft();
    if (['recovered', 'base-revision-mismatch', 'base-content-mismatch', 'base-content-unverified'].includes(draft.status)) {
      recoveryPrompt = createRecoveryPrompt(draft.status);
      const note = ui.recovery?.querySelector('[data-recovery-note]');
      if (note) note.textContent = draft.status === 'recovered'
        ? 'A local draft matches the published city. Recover it or discard it.'
        : draft.status === 'base-content-unverified'
          ? 'This older local draft has no published-content identity, so its base cannot be verified. Recovering it will replace this city in your browser. You can also export the draft.'
          : 'The published city has changed since this local draft was created. Recovering it will replace this city in your browser. You can also export the draft.';
    } else if (draft.status === 'corrupt') setStatus('A damaged local draft was quarantined for recovery');
    refreshUI();
    hooks.onInitialize?.(api);
    return api;
  }

  async function enter() {
    if (disposed || active || entryPending) return false;
    entryPending = true;
    let authorized;
    try { authorized = await authorizeEditorEntry({ publisherUrl }); }
    finally { entryPending = false; }
    if (!authorized || disposed || active) return false;
    active = true;
    previousMode = hooks.getMode?.() ?? 'onFoot';
    cameraSnapshot = startEditorCameraSession(camera, cameraNavigation, previousMode, (mode) => {
      const target = adapter.getNavigationTarget?.(mode);
      return target || new THREE.Vector3(camera.position.x, 0, camera.position.z);
    });
    hooks.stopSimulation?.();
    hooks.exitPointerLock?.();
    hooks.clearInputs?.();
    hooks.setMode?.('editor');
    Object.values(ui).forEach((panel) => { if (panel) { panel.hidden = false; panel.inert = false; } });
    document.documentElement.classList.add('is-editor');
    syncPanelLayout({ entering: true });
    transform.enabled = true;
    transform.getHelper().visible = true;
    if (recoveryPrompt.pending && ui.recovery?.showModal) ui.recovery.showModal();
    refreshUI();
    canvas.focus({ preventScroll: true });
    setStatus('Editor active · right-drag orbit · Shift+right-drag pan · wheel zoom');
    return true;
  }

  function exit() {
    // Pagehide disposes the editor immediately; do not leave the last committed
    // edit waiting for its autosave debounce. flush() is idle for clean stores,
    // clears the timer, and retains pending export data when storage fails.
    const saved = draftStore.flush();
    if (saved.status === 'unavailable') setStatus('Local draft recovery could not be saved. Download/Export JSON remains available.');
    if (!active) return false;
    cancelGesture();
    removeSelectionHelper();
    removeTransientClone();
    selected = null;
    transform?.detach();
    transform.enabled = false;
    transform.getHelper().visible = false;
    active = false;
    Object.values(ui).forEach((panel) => { if (panel) { panel.hidden = true; panel.inert = true; } });
    document.documentElement.classList.remove('is-editor');
    document.documentElement.classList.remove('editor-panel-assets-open', 'editor-panel-inspector-open');
    hooks.clearInputs?.();
    hooks.setMode?.(previousMode === 'editor' ? 'onFoot' : previousMode);
    restoreEditorCameraSession(camera, cameraSnapshot);
    cameraSnapshot = null;
    cameraNavigation?.reset(null);
    canvas.focus({ preventScroll: true });
    return true;
  }

  function selectById(id) {
    const record = recordFor(id);
    if (!record) return false;
    setSelected({ id, kind: record.kind, object: record.object, canTransform: record.canTransform });
    return true;
  }

  function update(delta) {
    if (!active) return;
    transform?.getHelper?.().updateMatrixWorld();
    if (preview && pendingAssetKey) preview.rotation.y = Math.round(preview.rotation.y / (Math.PI / 12)) * (Math.PI / 12);
    hooks.onUpdate?.(delta);
  }

  function dispose() {
    if (disposed) return;
    exit();
    cancelPlacement();
    removeTransientClone();
    listeners.splice(0).forEach((remove) => remove());
    transform?.dispose();
    aiPanel?.dispose();
    if (transform) scene.remove(transform.getHelper());
    disposed = true;
  }

  const api = {
    initialize, enter, exit, update, selectById, dispose, exportDraft,
    handleShortcut,
    runCommand(command) {
      return aiTools?.run(command) || { ok: false, error: { code: 'NOT_READY', message: 'Editor is still initializing.' } };
    },
    loadPublishedDocument(documentValue) {
      authoredRuntime.load(documentValue);
      adapter.applyOverrides?.(documentValue);
      refreshUI();
    },
    get active() { return active; },
    get selectedId() { return selected?.id ?? null; },
  };
  return api;
}
