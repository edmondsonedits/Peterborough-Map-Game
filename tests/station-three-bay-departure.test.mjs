import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIRE_STATION_THREE as station, PLAYER_TUNING, directionFromHeading} from '../city-explorer/gameplay-systems-1.6.69.js';

test('Station 3 starts outside the mapped bay frontage, aimed toward Clonsilla', () => {
  const data = JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url)));
  const building = data.elements.find(x => x.type === 'way' && x.id === 558402285);
  const road = data.elements.find(x => x.type === 'way' && x.id === 33930664);
  assert.ok(building?.geometry && road?.geometry);
  const lonScale = 111320 * Math.cos(44.3091 * Math.PI / 180);
  const project = p => ({x:(p.lon-station.truckLon)*lonScale, y:(p.lat-station.truckLat)*110540});
  const vertices = building.geometry.map(project);
  const inside = ({x,y}) => vertices.reduce((hit,a,i) => { const b=vertices[(i+vertices.length-1)%vertices.length]; return ((a.y>y)!==(b.y>y) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) ? !hit : hit; },false);
  const dir = directionFromHeading(station.truckHeading);
  const forward = {x:dir.x,y:-dir.z};
  assert.ok(!inside({x:0,y:0}), 'truck center must be outside the building shell');
  assert.ok(!inside({x:-forward.x*5.2,y:-forward.y*5.2}), 'truck rear must clear the building shell');
  const distanceToRoad = p => Math.min(...road.geometry.slice(1).map((end,i)=>{const a=project(road.geometry[i]), b=project(end), dx=b.x-a.x,dy=b.y-a.y; const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}));
  assert.ok(distanceToRoad({x:forward.x*15,y:forward.y*15}) < distanceToRoad({x:0,y:0})-10, 'forward motion should approach Clonsilla');
  const player = project({lat:station.playerLat,lon:station.playerLon});
  assert.ok(Math.hypot(player.x,player.y) < PLAYER_TUNING.enterDistance, 'firefighter can enter the truck');
  assert.ok(Math.abs(player.x * forward.y - player.y * forward.x) > 2, 'firefighter starts clear of the truck side');
});
