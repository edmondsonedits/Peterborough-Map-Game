import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { cancelTransformControlDrag, rebindEditorSelection } from '../city-explorer/editor/editor-interactions.js';
import { createEditorCameraNavigation } from '../city-explorer/editor/editor-camera-navigation.js';
import { createAuthoredRuntime } from '../city-explorer/editor/authored-runtime.js';

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
assert.match(editor, /matchMedia\?\.\('\(max-width: 760px\)'\)/, 'mobile editor drawers should start collapsed at narrow viewport sizes');
assert.match(app, /if\s*\(cityEditor\?\.active\)\s*\{\s*cityEditor\.handleShortcut\(event\);\s*return;/, 'editor navigation keys must not leak into driving handlers');

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

console.log('City editor interaction fixes passed.');
