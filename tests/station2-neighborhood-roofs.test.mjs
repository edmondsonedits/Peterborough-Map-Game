import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStation2NeighborhoodGableRoof} from '../city-explorer/station2-neighborhood-roofs.mjs';

const ring=[[0,0],[10,0],[10,4],[4,4],[4,9],[0,9]];
const triangles=[[0,1,3],[1,2,3],[0,3,4],[0,4,5]];
function inPolygon(x,z,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j],cross=(x-a[0])*(b[1]-a[1])-(z-a[1])*(b[0]-a[0]);if(Math.abs(cross)<1e-7&&x>=Math.min(a[0],b[0])-1e-7&&x<=Math.max(a[0],b[0])+1e-7&&z>=Math.min(a[1],b[1])-1e-7&&z<=Math.max(a[1],b[1])+1e-7)return true;if(((a[1]>z)!==(b[1]>z))&&(x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]))inside=!inside;}return inside;}
function vertices(flat){const out=[];for(let i=0;i<flat.length;i+=3)out.push([flat[i],flat[i+1],flat[i+2]]);return out;}

test('clipped gable roof stays inside a concave footprint and preserves the roof envelope',()=>{
  const result=buildStation2NeighborhoodGableRoof({ring,triangles,wallTop:4,roofTop:6.5});
  assert.equal(result.valid,true);
  assert.ok(result.roofTriangles.length>0);
  assert.ok(result.gableTriangles.length>0);
  const all=[...vertices(result.roofTriangles),...vertices(result.gableTriangles)];
  assert.ok(all.every(([x,y,z])=>Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z)));
  assert.ok(all.every(([x,y,z])=>inPolygon(x,z,ring)), 'roof and end wall vertices must remain in the building footprint');
  assert.ok(all.every(([,y])=>y>=4-1e-7&&y<=6.5+1e-7));
  assert.ok(Math.abs(Math.max(...vertices(result.roofTriangles).map(v=>v[1]))-6.5)<1e-7);
  assert.deepEqual(result.wallTop,4);
  assert.deepEqual(result.roofTop,6.5);
});

test('ridge follows the dominant footprint axis and triangulation can be injected',()=>{
  let received=null;
  const result=buildStation2NeighborhoodGableRoof({ring,wallTop:3,roofTop:5,triangulate(points){received=points;return triangles;}});
  assert.equal(result.valid,true);
  assert.equal(received.length,ring.length);
  assert.ok(Math.abs(result.ridgeAxis.x)>.99);
  assert.ok(Math.abs(result.spanMetres.ridge-10)<1e-6);
});

test('invalid coordinates and triangle budgets fail closed without partial geometry',()=>{
  const invalid=buildStation2NeighborhoodGableRoof({ring:[[0,0],[1,0],[NaN,1],[0,1]],wallTop:2,roofTop:4,triangles:[[0,1,2]]});
  assert.equal(invalid.valid,false);
  assert.equal(invalid.reason,'invalid-ring');
  assert.deepEqual(invalid.roofTriangles,[]);
  const capped=buildStation2NeighborhoodGableRoof({ring,triangles,wallTop:2,roofTop:4,maxRoofTriangles:1});
  assert.equal(capped.valid,false);
  assert.equal(capped.reason,'triangle-budget');
  assert.deepEqual(capped.roofTriangles,[]);
});

test('concave notch walls close the gap between eaves and the clipped ridge',()=>{
  const result=buildStation2NeighborhoodGableRoof({ring,triangles,wallTop:4,roofTop:6.5});
  const gables=vertices(result.gableTriangles);
  for(const [x,z] of [[10,4],[4,4],[4,9]]) {
    const expected=4+2.5*(1-Math.abs(2*z/9-1));
    assert.ok(gables.some(v=>Math.abs(v[0]-x)<1e-7&&Math.abs(v[2]-z)<1e-7&&Math.abs(v[1]-expected)<1e-7), 'every elevated notch corner needs a closed wall to the roof plane');
  }
  for(let i=0;i<result.roofTriangles.length;i+=9) {
    const [a,b,c]=vertices(result.roofTriangles.slice(i,i+9));
    const normalY=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
    assert.ok(normalY>=-1e-8,'roof faces must point upward');
  }
});