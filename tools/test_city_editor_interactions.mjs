import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { cancelTransformControlDrag, rebindEditorSelection } from '../city-explorer/editor/editor-interactions.js';
import { createEditorCameraNavigation } from '../city-explorer/editor/editor-camera-navigation.js';
import { createAuthoredRuntime } from '../city-explorer/editor/authored-runtime.js';
import { restoreEditorCameraSession, startEditorCameraSession } from '../city-explorer/editor/editor-camera-session.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'city-explorer/index.html'), 'utf8');
const css = await readFile(path.join(root, 'city-explorer/styles.css'), 'utf8');
const editor = await readFile(path.join(root, 'city-explorer/editor/city-editor.js'), 'utf8');
const app = await readFile(path.join(root, 'city-explorer/app.js'), 'utf8');

const authoredRuntime = createAuthoredRuntime({
  THREE,
  project: (latitude, longitude) => new THREE.Vector2(longitude * 1000, latitude * 1000),
  terrainHeightAtWorld: () => 0,
  authoredDetailGroup: new THREE.Group(),
});
const authoredRecord = {
  id: 'authored-a', assetKey: 'tree', label: 'Test tree', visible: true, properties: {},
  transform: { longitude: -78.3, latitude: 44.3, elevation: 0, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
};
const authoredDocument = { objects: [authoredRecord] };
authoredRuntime.load(authoredDocument);
const staleObject = authoredRuntime.getObject(authoredRecord.id);
authoredRuntime.load(authoredDocument);
const liveObject = authoredRuntime.getObject(authoredRecord.id);
assert.deepEqual(
  rebindEditorSelection({ id: authoredRecord.id, kind: 'authored', object: staleObject }, (id) => ({ ...authoredRecord, id, kind: 'authored', object: authoredRuntime.getObject(id) })),
  { id: authoredRecord.id, kind: 'authored', object: liveObject, canTransform: undefined },
  'document reload should re-resolve selection to the current runtime object',
);
assert.equal(rebindEditorSelection({ id: 'deleted', object: staleObject }, () => null), null, 'selection should clear when its record no longer exists');

let pointerUpArgument = 'not-called';
const draggingControl = {
  dragging: true,
  axis: 'X',
  pointerUp(pointer) { pointerUpArgument = pointer; this.dragging = false; this.axis = null; },
};
cancelTransformControlDrag(draggingControl);
assert.equal(pointerUpArgument, null, 'Escape should send a terminal pointerUp to TransformControls');
assert.equal(draggingControl.dragging, false, 'Escape should release the TransformControls drag');
assert.equal(draggingControl.axis, null, 'Escape should clear the active gizmo axis');

assert.match(html, /data-editor-panel-toggle="assets"/, 'mobile editor needs an asset drawer toggle');
assert.match(html, /data-editor-panel-toggle="inspector"/, 'mobile editor needs an inspector drawer toggle');
assert.match(css, /\.is-editor #city-editor-left:not\(\[hidden\]\)[\s\S]*?max-height:\s*55vh/, 'an opened mobile drawer should overlay a bounded area instead of consuming half the canvas');
assert.match(editor, /rebindEditorSelection/, 'history reload should rebind or clear the current selection');
assert.match(editor, /cancelTransformControlDrag/, 'gesture cancellation should release TransformControls');
assert.doesNotMatch(editor, /transform\?\.updateMatrixWorld\(/, 'the TransformControls wrapper is not an Object3D and must not receive updateMatrixWorld');
assert.match(editor, /transform\?\.getHelper\?\.\(\)\.updateMatrixWorld\(/, 'the TransformControls helper should receive matrix updates');
assert.match(editor, /startEditorCameraSession\(camera, cameraNavigation, previousMode/, 'every editor entry should snapshot and reset navigation for its prior mode');
assert.match(editor, /restoreEditorCameraSession\(camera, cameraSnapshot\)/, 'editor exit should restore the exact prior camera state');
assert.match(editor, /matchMedia\?\.\('\(max-width: 760px\)'\)/, 'mobile editor drawers should start collapsed at narrow viewport sizes');
assert.match(app, /if\s*\(cityEditor\?\.active\)\s*\{\s*cityEditor\.handleShortcut\(event\);\s*return;/, 'editor navigation keys must not leak into driving handlers');
assert.match(app, /getNavigationTarget\(\)[\s\S]*?intersectObjects\(terrainGroup\.children, true\)[\s\S]*?terrainHeightAtWorld/, 'editor navigation should target real terrain, with a ground-height fallback');

const camera = new THREE.PerspectiveCamera(60, 1.5, 0.1, 10000);
camera.position.set(0, 15, 30);
camera.lookAt(0, 0, 0);
const targetObject = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
targetObject.position.set(4, 0, 2);
const objectBefore = targetObject.position.clone();
const nav = createEditorCameraNavigation(THREE, camera, { width: 900, height: 600 });
assert.equal(nav.begin({ button: 2, clientX: 100, clientY: 100, shiftKey: false }), true, 'right drag should begin editor orbit navigation');
nav.move({ clientX: 155, clientY: 118 });
const afterOrbit = camera.position.clone();
assert.notDeepEqual(afterOrbit.toArray(), [0, 15, 30], 'right drag should move the editor camera');
nav.end();
assert.equal(nav.begin({ button: 2, clientX: 155, clientY: 118, shiftKey: true }), true, 'shift-right drag should begin editor pan navigation');
const targetBeforePan = nav.target.clone();
nav.move({ clientX: 170, clientY: 130 });
assert.notDeepEqual(nav.target.toArray(), targetBeforePan.toArray(), 'shift-right drag should pan the editor camera target');
nav.end();
nav.zoom(120);
assert.notDeepEqual(camera.position.toArray(), afterOrbit.toArray(), 'wheel input should zoom the editor camera');
assert.deepEqual(targetObject.position.toArray(), objectBefore.toArray(), 'camera navigation must not transform the selected object');

const overheadCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
overheadCamera.position.set(0, 40, 0);
overheadCamera.up.set(0, 0, -1);
overheadCamera.lookAt(0, 0, 0);
const overheadNav = createEditorCameraNavigation(THREE, overheadCamera, { width: 500, height: 500 });
overheadNav.begin({ button: 2, clientX: 10, clientY: 10, shiftKey: true });
const overheadTarget = overheadNav.target.clone();
overheadNav.move({ clientX: 40, clientY: 10 });
assert.ok(overheadNav.target.distanceTo(overheadTarget) > 0.1, 'pan should remain usable when the camera looks straight down');

for (const modeCase of [
  { mode: 'map', altitude: 5600 },
  { mode: 'fly', altitude: 420 },
  { mode: 'onFoot', altitude: 2 },
]) {
  const modeCamera = new THREE.PerspectiveCamera(55, 1.7, 0.1, 20000);
  modeCamera.position.set(120, modeCase.altitude, 80);
  modeCamera.up.set(0, 1, 0);
  modeCamera.lookAt(0, 0, 0);
  modeCamera.zoom = 1.3;
  modeCamera.updateProjectionMatrix();
  modeCamera.updateMatrixWorld(true);
  const prior = {
    position: modeCamera.position.toArray(),
    quaternion: modeCamera.quaternion.toArray(),
    up: modeCamera.up.toArray(),
    zoom: modeCamera.zoom,
    projection: modeCamera.projectionMatrix.toArray(),
    projectionInverse: modeCamera.projectionMatrixInverse.toArray(),
  };
  const modeNavigation = createEditorCameraNavigation(THREE, modeCamera, { width: 1000, height: 700 });
  let resolvedMode = null;
  const session = startEditorCameraSession(modeCamera, modeNavigation, modeCase.mode, (mode) => {
    resolvedMode = mode;
    return new THREE.Vector3(120, 0, 80);
  });
  assert.equal(resolvedMode, modeCase.mode, `${modeCase.mode} entry should resolve its own ground target`);
  assert.ok(Math.abs(modeNavigation.distanceToTarget() - modeCase.altitude) < 0.01, `${modeCase.mode} navigation scale should use altitude above ground`);
  const firstTarget = modeNavigation.target.clone();
  const initialDistance = modeNavigation.distanceToTarget();
  modeNavigation.begin({ button: 2, clientX: 20, clientY: 20, shiftKey: true });
  modeNavigation.move({ clientX: 70, clientY: 40 });
  const expectedPanDistance = initialDistance * Math.hypot(50, 20) / 700;
  assert.ok(Math.abs(modeNavigation.target.distanceTo(firstTarget) - expectedPanDistance) < 0.01, `${modeCase.mode} pan speed should scale with its actual ground distance`);
  modeNavigation.end();
  const beforeZoomDistance = modeNavigation.distanceToTarget();
  const afterZoomDistance = modeNavigation.zoom(80);
  assert.ok(Math.abs(afterZoomDistance - Math.max(8, beforeZoomDistance) * Math.exp(0.08)) < 0.01, `${modeCase.mode} wheel zoom should scale from its actual target distance`);
  restoreEditorCameraSession(modeCamera, session);
  assert.deepEqual(modeCamera.position.toArray(), prior.position, `${modeCase.mode} exit should restore camera position`);
  assert.deepEqual(modeCamera.quaternion.toArray(), prior.quaternion, `${modeCase.mode} exit should restore camera orientation`);
  assert.deepEqual(modeCamera.up.toArray(), prior.up, `${modeCase.mode} exit should restore camera up vector`);
  assert.equal(modeCamera.zoom, prior.zoom, `${modeCase.mode} exit should restore camera zoom`);
  assert.deepEqual(modeCamera.projectionMatrix.toArray(), prior.projection, `${modeCase.mode} exit should restore the projection matrix`);
  assert.deepEqual(modeCamera.projectionMatrixInverse.toArray(), prior.projectionInverse, `${modeCase.mode} exit should restore the inverse projection matrix`);
  assert.deepEqual(firstTarget.toArray(), [120, 0, 80]);
  const secondTarget = new THREE.Vector3(-30, 0, 15);
  const nextSession = startEditorCameraSession(modeCamera, modeNavigation, modeCase.mode, () => secondTarget);
  assert.deepEqual(modeNavigation.target.toArray(), secondTarget.toArray(), `${modeCase.mode} next entry should replace the prior target`);
  restoreEditorCameraSession(modeCamera, nextSession);
  modeNavigation.reset(null);
  assert.deepEqual(modeNavigation.target.toArray(), [0, 0, 0], `${modeCase.mode} exit should clear its navigation target`);
}

console.log('City editor interaction fixes passed.');
