/* Source-backed coordinates and required route/collision probes for world parity. */
export const SURFACE_FIXTURES = Object.freeze([
  {id:'station-frontage-road-pack-probe',kind:'road',world:{x:-232.247,z:926.538},source:'road-pack terrain probe'},
  {id:'hunter-street-bridge-deck',kind:'bridge',expectedLayer:'bridges',lat:44.306,lon:-78.3152,source:'Municipal BR60 / Hunter Street bridge; source way/33954231'},
  {id:'hunter-street-east-underpass',kind:'underpass',expectedLayer:'road_surfaces',lat:44.30795,lon:-78.30055,source:'OSM tunnel way/235892027'},
  {id:'west-end-drumlin-slope',kind:'hill',lat:44.31,lon:-78.37,source:'2025 Ontario lidar terrain'},
  {id:'off-road-south-park',kind:'offRoad',lat:44.2978,lon:-78.3372,source:'terrain grid point away from road-pack triangles'},
  {id:'station-one-apron',kind:'stationApron',station:1,local:{x:0,z:-5.6},source:'station1/layout.json apron'},
  {id:'station-two-apron',kind:'stationApron',station:2,local:{x:0,z:-5.6},source:'station2/layout.json apron'},
  {id:'station-two-bay-floor',kind:'stationFloor',expectedSurfaceId:'station2-slab',station:2,local:{x:0,z:10},source:'station2/layout.json bay slab'},
]);
export const ROUTE_FIXTURES = Object.freeze([
  {id:'hunter-bridge-crossing',points:[{lat:44.3057,lon:-78.3158},{lat:44.306,lon:-78.3152},{lat:44.3061,lon:-78.3149}]},
  {id:'hunter-underpass-approach',points:[{lat:44.30788,lon:-78.30095},{lat:44.30795,lon:-78.30055},{lat:44.30802,lon:-78.3001}]},
  {id:'sherbrooke-station-approach',points:[{world:{x:-232.247,z:926.538}},{lat:44.3007,lon:-78.3225},{lat:44.30065,lon:-78.3221}]},
]);
export const COLLISION_FIXTURES = Object.freeze([
  {id:'station-one-side-wall',station:1,local:{x:'bay.maxX+0.12',z:'(bay.frontZ+bay.rearZ)/2'},blocked:true},
  {id:'station-one-closed-front-door',station:1,local:{x:0,z:'bay.frontZ'},blocked:true,doorFraction:0},
  {id:'station-one-open-front-door-traversal',station:1,from:{x:0,z:'bay.frontZ+4'},to:{x:0,z:'bay.frontZ-4'},blocked:false,doorFraction:1},
  {id:'station-two-side-wall',station:2,local:{x:'bay.maxX+0.12',z:'(bay.frontZ+bay.rearZ)/2'},blocked:true},
  {id:'station-two-front-door-closed',station:2,local:{x:0,z:'bay.frontZ'},blocked:true,doorFraction:0},
  {id:'station-two-open-front-door-traversal',station:2,from:{x:0,z:'bay.frontZ+4'},to:{x:0,z:'bay.frontZ-4'},blocked:false,doorFraction:1},
  {id:'station-three-closed-door-traversal',station:3,from:{x:-0.7,z:-1},to:{x:-0.7,z:1},blocked:true,doorFraction:0},
  {id:'station-three-open-door-traversal',station:3,from:{x:-0.7,z:-1},to:{x:-0.7,z:1},blocked:false,doorFraction:1},
]);
