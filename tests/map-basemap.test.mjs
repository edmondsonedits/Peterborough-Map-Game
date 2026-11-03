import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMapTileSource, planMapTiles, mapTileGeometryData, createMapBasemap,
} from '../city-explorer/map-basemap.mjs';
import { lonLatToWebMercatorTile } from '../city-explorer/map-view.mjs';

const projection={
  project:(lat,lon)=>({x:(lon+78.32)*80000,z:-(lat-44.3)*110540}),
  unproject:(x,z)=>({lat:44.3-z/110540,lon:-78.32+x/80000}),
};

test('public map sources expose attribution and production sources require configured credentials',()=>{
  const osm=resolveMapTileSource('osm');
  assert.match(osm.template,/tile\.openstreetmap\.org/);
  assert.match(osm.attribution,/OpenStreetMap contributors/);
  const imagery=resolveMapTileSource('satellite');
  assert.match(imagery.template,/World_Imagery\/MapServer\/tile/);
  assert.match(imagery.attribution,/Esri/);
  assert.match(resolveMapTileSource('osm',{deployment:{commercial:true}}).error,/Configure/);
  assert.match(resolveMapTileSource('satellite',{deployment:{commercial:true}}).error,/token/);
  assert.match(resolveMapTileSource('osm',{mapConfig:{osmTileUrl:'https://maps.example/{z}/{x}/{y}.png'},deployment:{commercial:true}}).template,/maps\.example/);
  assert.match(resolveMapTileSource('satellite',{mapConfig:{arcgisAccessToken:'secret'},deployment:{commercial:true}}).template,/token=secret/);
});

test('viewport planner covers center, zooms in close, and stays independent of basemap choice',()=>{
  const base={...projection,centerX:0,centerZ:0,viewportWidth:1200,viewportHeight:800,fovDegrees:58};
  const overview=planMapTiles({...base,altitudeAGL:5600});
  const close=planMapTiles({...base,altitudeAGL:120});
  assert.ok(close.zoom>overview.zoom);
  const centerGeo=projection.unproject(0,0),centerTile=lonLatToWebMercatorTile(centerGeo.lat,centerGeo.lon,close.zoom);
  assert.ok(close.tiles.some(tile=>tile.x===Math.floor(centerTile.x)&&tile.y===Math.floor(centerTile.y)));
  assert.deepEqual(close.tiles.map(({z,x,y})=>`${z}/${x}/${y}`),planMapTiles({...base,altitudeAGL:120}).tiles.map(({z,x,y})=>`${z}/${x}/${y}`));
  assert.ok(close.tiles.length<80,'viewport remains bounded at closest zoom');
});

test('draped tile vertices follow nonzero sloped terrain above its surface',()=>{
  const tile={x:Math.floor(lonLatToWebMercatorTile(44.3,-78.32,16).x),y:Math.floor(lonLatToWebMercatorTile(44.3,-78.32,16).y),z:16};
  const surface=(x,z)=>210+x*.015-z*.025;
  const data=mapTileGeometryData(tile,{project:projection.project,surfaceAt:surface,segments:4});
  const heights=Array.from({length:25},(_,i)=>data.positions[i*3+1]);
  assert.ok(Math.max(...heights)>Math.min(...heights),'terrain slope changes the tile mesh elevations');
  for(let i=0;i<heights.length;i++)assert.ok(Math.abs(heights[i]-(surface(data.positions[i*3],data.positions[i*3+2])+1.5))<1e-5);
});

test('tile layer stays idle until selected and releases meshes and cached textures on dispose',async()=>{
  const textures=[],bitmaps=[];
  class Geometry { setAttribute(){} setIndex(){} computeVertexNormals(){} computeBoundingSphere(){} dispose(){this.disposed=true;} }
  class Texture { constructor(bitmap){this.bitmap=bitmap;textures.push(this);} dispose(){this.disposed=true;} }
  class Material { constructor(options){Object.assign(this,options);} dispose(){this.disposed=true;} }
  class Mesh { constructor(geometry,material){this.geometry=geometry;this.material=material;this.userData={};} }
  class BufferAttribute { constructor(array,itemSize){this.array=array;this.itemSize=itemSize;} }
  const THREE={BufferGeometry:Geometry,Texture,MeshBasicMaterial:Material,Mesh,BufferAttribute,DoubleSide:2,LinearMipmapLinearFilter:1,LinearFilter:2,SRGBColorSpace:'srgb'};
  const group={children:[],add(mesh){this.children.push(mesh);},remove(mesh){this.children.splice(this.children.indexOf(mesh),1);}};
  let requests=0,bitmapOptions=null;
  const layer=createMapBasemap({THREE,group,...projection,surfaceAt:(x,z)=>210+x*.01,fetchImpl:async()=>{requests++;return{ok:true,blob:async()=>({})};},bitmapFactory:async(_blob,options)=>{bitmapOptions=options;const bitmap={close(){this.closed=true;}};bitmaps.push(bitmap);return bitmap;}});
  const view={layer:'osm',centerX:0,centerZ:0,altitudeAGL:1200,viewportWidth:900,viewportHeight:650,fovDegrees:58};
  layer.update({...view,active:false});
  assert.equal(requests,0);
  layer.update({...view,active:true});
  assert.ok(layer.state().activeRequests<=6);
  for(let i=0;i<20&&(layer.state().activeRequests||layer.state().queuedRequests);i++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.ok(requests>0);
  assert.ok(layer.state().loadedTileCount>0);
  assert.equal(group.children.length,layer.state().loadedTileCount);
  assert.equal(bitmapOptions.imageOrientation,'flipY');
  assert.equal(group.children[0].material.depthTest,false);
  assert.equal(group.children[0].material.transparent,true);
  assert.equal(group.children[0].material.opacity,1);
  assert.equal(group.children[0].renderOrder,1000000);
  layer.dispose();
  assert.equal(group.children.length,0);
  assert.ok(textures.every(texture=>texture.disposed));
  assert.ok(bitmaps.every(bitmap=>bitmap.closed));
});

test('transient tile failure retries after backoff and clears its status after recovery',async()=>{
  const makeThree=()=>{
    class Geometry { setAttribute(){} setIndex(){} computeVertexNormals(){} computeBoundingSphere(){} dispose(){} }
    class Texture { constructor(bitmap){this.bitmap=bitmap;} dispose(){} }
    class Material { constructor(options){Object.assign(this,options);} dispose(){} }
    class Mesh { constructor(geometry,material){this.geometry=geometry;this.material=material;this.userData={};} }
    class BufferAttribute { constructor(array,itemSize){this.array=array;this.itemSize=itemSize;} }
    return{BufferGeometry:Geometry,Texture,MeshBasicMaterial:Material,Mesh,BufferAttribute,DoubleSide:2,LinearMipmapLinearFilter:1,LinearFilter:2,SRGBColorSpace:'srgb'};
  };
  const group={children:[],add(mesh){this.children.push(mesh);},remove(mesh){this.children.splice(this.children.indexOf(mesh),1);}};
  let failures=1;
  const layer=createMapBasemap({THREE:makeThree(),group,...projection,fetchImpl:async()=>{
    if(failures-- > 0)throw new Error('temporary connection loss');
    return{ok:true,blob:async()=>({})};
  },bitmapFactory:async()=>({close(){}})});
  const view={active:true,layer:'osm',centerX:0,centerZ:0,altitudeAGL:800,viewportWidth:720,viewportHeight:520,fovDegrees:58};
  layer.update(view);
  for(let i=0;i<80&&!layer.state().retryingCount;i++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.ok(layer.state().retryingCount>0);
  assert.match(layer.state().error,/retrying/);
  for(let i=0;i<130&&(layer.state().retryingCount||layer.state().activeRequests||layer.state().queuedRequests);i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(layer.state().retryingCount,0);
  assert.equal(layer.state().error,'');
  assert.ok(layer.state().requestCount>1);
  layer.dispose();
});
