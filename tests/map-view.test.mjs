import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampMapAltitudeAGL, mapAltitudeFromWheel, mapPanFromDrag,
  lonLatToWebMercatorTile, webMercatorTileToLonLat, webMercatorTileVertices,
} from '../city-explorer/map-view.mjs';

test('map drag pans by visible world units and keeps north-up orientation', () => {
  const pan = mapPanFromDrag({deltaX:100,deltaY:50,altitudeAGL:1000,viewportWidth:1000,viewportHeight:500,fovDegrees:60});
  assert.ok(pan.x < 0, 'dragging east moves the camera west');
  assert.ok(pan.z < 0, 'dragging down moves the camera north');
  assert.ok(Math.abs(pan.x / pan.z - 2) < 1e-9, 'pan scales with equal screen-pixel dimensions');
});

test('map zoom remains bounded in metres above ground and normalizes wheel units', () => {
  assert.equal(clampMapAltitudeAGL(10),100);
  assert.equal(clampMapAltitudeAGL(50000),18000);
  assert.ok(mapAltitudeFromWheel(1000,-120,0) < 1000);
  assert.ok(Math.abs(mapAltitudeFromWheel(1000,1,1)-mapAltitudeFromWheel(1000,16,0)) < 1e-8);
});

test('Web Mercator tile coordinates round-trip and vertices align north/south through local projection', () => {
  const zoom=15, point={lat:44.3,lon:-78.32};
  const tile=lonLatToWebMercatorTile(point.lat,point.lon,zoom);
  const geo=webMercatorTileToLonLat(tile.x,tile.y,zoom);
  assert.ok(Math.abs(geo.lon-point.lon)<360/(2**zoom));
  assert.ok(Math.abs(geo.lat-point.lat)<180/(2**zoom));
  const project=(lat,lon)=>({x:(lon+78.32)*80000,z:-(lat-44.3)*110540});
  const vertices=webMercatorTileVertices(Math.floor(tile.x),Math.floor(tile.y),zoom,project,{segments:8});
  const northWest=vertices[0],northEast=vertices[8],southWest=vertices[8*9],southEast=vertices[8*9+8];
  assert.ok(northWest.z < southWest.z, 'north tile edge has a smaller world z');
  assert.ok(northWest.x < northEast.x, 'east tile edge has a larger world x');
  assert.equal(vertices.length,81);
});
