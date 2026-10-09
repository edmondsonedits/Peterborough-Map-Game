import { performance } from 'node:perf_hooks';
import { solveFallbackJunctions } from '../city-explorer/fallback-junction-geometry.js';

const COUNT = Number(process.argv[2] || 1500);
if (!Number.isInteger(COUNT) || COUNT < 1 || COUNT > 20000) throw new Error('Expected 1–20000 junctions');
const roads = [];
const make = (a, b, id) => ({
  a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] },
  aY: 100, bY: 100, width: 6.2, lineId: id,
  aSourceVertex: true, bSourceVertex: true,
  profile: { surfaceKey: 'roadLocal', edgeKey: 'roadEdge', renderClass: 'local' },
});
for (let i = 0; i < COUNT; i++) {
  const x = (i % 50) * 100, z = Math.floor(i / 50) * 100;
  roads.push(
    make([x,z], [x+25,z], i+':e'),
    make([x,z], [x-25,z], i+':w'),
    make([x,z], [x,z+25], i+':n'),
    make([x,z], [x,z-25], i+':s'),
  );
}
solveFallbackJunctions(roads.slice(0, 120)); // warm-up
const start = performance.now();
const result = solveFallbackJunctions(roads);
const elapsed = performance.now() - start;
const triangles = result.polygons.reduce((sum,p) => sum+p.triangles.length/3,0);
if (result.polygons.length !== COUNT) throw new Error('Unexpected polygon count ' + result.polygons.length + ', expected ' + COUNT);
console.log(JSON.stringify({ kind:'synthetic-CPU-only', junctionCount:COUNT, roads:roads.length, polygons:result.polygons.length,
  triangles, solveMs:Number(elapsed.toFixed(3)), solveMsPerJunction:Number((elapsed/COUNT).toFixed(4)),
  note:'Not a browser render/GPU/FPS comparison; run matched baseline and prototype scenes on actual target devices.' },null,2));
