(() => {
  'use strict';

  const VERSION = '1.6.97';
  const CONFIG = Object.freeze({
    roadUrl: '../city-explorer/data/osm-public-roads.geojson',
    centerLat: 44.3091,
    centerLng: -78.3197,
    gridSize: 120,
    roadSearchRadius: 130,
    destinationSearchRadius: 520,
    strokeAnchorSpacing: 170,
    strokeTolerance: 22,
    straightAssistTolerance: 52,
    straightAssistRatio: 0.78,
    straightAssistMaxDeviation: 95,
    weakTurnDeviation: 48,
    weakTurnAngle: 32,
    loopCollapseSavings: 120,
    loopCollapseRatio: 0.82,
    detourAnchorSavings: 90,
    detourAnchorRatio: 0.84,
    destinationApproachRadius: 260,
    strokeDirectionPenalty: 85,
    strokeRoadContinuityBonus: 24,
    canonicalCallCount: 100,
    advancedCallCount: 100,
    advancedMinSpacing: 190,
    difficultyApproachDistance: 700,
    adaptiveSkillStorageKey: 'ptboRouteMappingAdaptiveSkillV1',
    adaptiveDefaultRating: 28,
    adaptiveCalibrationCalls: 6,
    adaptiveHistorySize: 20,
    adaptiveRecentWindow: 6,
    adaptiveBaseChallenge: 5,
    adaptiveCallBand: 12,
    adaptiveStretchChance: 0.16,
    adaptiveBreatherChance: 0.10,
    progressionStorageKey: 'ptboRouteMappingProgressionV1',
    callsPerStationPhase: 20,
    peterboroughCallProximity: 1400,
    continuousMinNextCallDistance: 850,
    maxIntermediateAnchors: 9,
    maxVisitedNodes: 120000,
    routeTapZoom: 16,
    recentCalls: 10,
  });

  const METERS_PER_LAT = 110540;
  const METERS_PER_LNG = 111320 * Math.cos(CONFIG.centerLat * Math.PI / 180);
  const ROAD_PROFILE = Object.freeze({
    motorway:{speed:100,priority:.86},motorway_link:{speed:55,priority:.94},trunk:{speed:80,priority:.88},trunk_link:{speed:50,priority:.96},
    primary:{speed:65,priority:.88},primary_link:{speed:45,priority:.96},secondary:{speed:55,priority:.92},secondary_link:{speed:40,priority:.98},
    tertiary:{speed:45,priority:1},tertiary_link:{speed:35,priority:1.04},unclassified:{speed:35,priority:1.18},residential:{speed:32,priority:1.32},
    living_street:{speed:18,priority:1.62},service:{speed:18,priority:1.82},road:{speed:28,priority:1.28}
  });

  const ui = {
    app:document.getElementById('route-app'), map:document.getElementById('map'), drawSurface:document.getElementById('draw-surface'),
    callNumber:document.getElementById('call-number'), difficultyLabel:document.getElementById('difficulty-label'), baseLabel:document.getElementById('base-label'), callType:document.getElementById('call-type'),
    callAddress:document.getElementById('call-address'), hint:document.getElementById('hint'), clear:document.getElementById('clear-button'),
    undo:document.getElementById('undo-button'), submit:document.getElementById('submit-button'), results:document.getElementById('results'),
    efficiency:document.getElementById('efficiency-value'), playerDistance:document.getElementById('player-distance'), shortestDistance:document.getElementById('shortest-distance'),
    extraDistance:document.getElementById('extra-distance'), resultNote:document.getElementById('result-note'), next:document.getElementById('next-button'),
    settingsButton:document.getElementById('settings-button'), settingsSheet:document.getElementById('settings-sheet'), settingsForm:document.getElementById('settings-form'),
    settingsClose:document.getElementById('settings-close'), serviceSelect:document.getElementById('service-select'), baseSelect:document.getElementById('base-select'),
    error:document.getElementById('loading-error'), errorMessage:document.getElementById('loading-error-message'), retry:document.getElementById('retry-button')
  };

  const state = {
    map:null, graph:null, calls:[], originalCalls:[], advancedCalls:[], difficultyIndex:null, service:'fire', base:null, call:null, callCount:0, recentCallIds:[], mode:'loading',
    skillProfiles:null, skillProfile:null, adaptiveTarget:null, progression:null, phase:null,
    rawPoints:[], rawLine:null, drawingPointer:null, originAnchor:null, destinationAnchor:null, anchors:[], history:[], playerRoute:null,
    shortestRoute:null, recommendedRoute:null, playerLayers:[], referenceLayers:[], startMarker:null, callMarker:null, editMarker:null, previewLine:null,
    interactiveLine:null, editDraft:null, lastPreviewAt:0, firstSnapShown:false
  };

  function toXY(lat,lng){ return {x:(lng-CONFIG.centerLng)*METERS_PER_LNG,y:(lat-CONFIG.centerLat)*METERS_PER_LAT}; }
  function toLatLng(x,y){ return {lat:y/METERS_PER_LAT+CONFIG.centerLat,lng:x/METERS_PER_LNG+CONFIG.centerLng}; }
  function dist(a,b){ if(!a||!b)return Infinity; const aa=toXY(a.lat,a.lng),bb=toXY(b.lat,b.lng); return Math.hypot(bb.x-aa.x,bb.y-aa.y); }
  function formatDistance(m){ if(!Number.isFinite(m))return '—'; return m<1000?Math.round(m)+' m':(m/1000).toFixed(m<10000?1:0)+' km'; }
  function keyCoord(lng,lat){ return Number(lng).toFixed(7)+','+Number(lat).toFixed(7); }
  function roadProfile(p){ const h=String(p&&p.highway||'road').toLowerCase(); return Object.assign({highway:h},ROAD_PROFILE[h]||ROAD_PROFILE.road); }
  function forwardOnly(p){ const v=String(p&&p.oneway||'').toLowerCase(); return v==='yes'||v==='true'||v==='1'; }
  function reverseOnly(p){ return String(p&&p.oneway||'').toLowerCase()==='-1'; }
  function roadName(p){ return String(p&&p.name||p&&p.ref||'Unnamed road').trim()||'Unnamed road'; }

  class MinHeap {
    constructor(){this.items=[];}
    get size(){return this.items.length;}
    push(item){const a=this.items;a.push(item);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p].score<=item.score)break;a[i]=a[p];i=p;}a[i]=item;}
    pop(){const a=this.items;if(!a.length)return null;const root=a[0],tail=a.pop();if(a.length&&tail){let i=0;while(true){const l=i*2+1,r=l+1;if(l>=a.length)break;let c=l;if(r<a.length&&a[r].score<a[l].score)c=r;if(a[c].score>=tail.score)break;a[i]=a[c];i=c;}a[i]=tail;}return root;}
  }

  function addGrid(grid,x,y,index,padding){
    const minX=Math.floor((x-padding)/CONFIG.gridSize),maxX=Math.floor((x+padding)/CONFIG.gridSize),minY=Math.floor((y-padding)/CONFIG.gridSize),maxY=Math.floor((y+padding)/CONFIG.gridSize);
    for(let gx=minX;gx<=maxX;gx+=1)for(let gy=minY;gy<=maxY;gy+=1){const k=gx+','+gy,b=grid.get(k);if(b)b.push(index);else grid.set(k,[index]);}
  }

  function buildGraph(geojson){
    const nodes=[],nodeByCoord=new Map(),nodeGrid=new Map(),segments=[],segmentGrid=new Map();let directedEdges=0;
    function nodeFor(c){const lng=Number(c&&c[0]),lat=Number(c&&c[1]);if(!Number.isFinite(lat)||!Number.isFinite(lng))return -1;const k=keyCoord(lng,lat);if(nodeByCoord.has(k))return nodeByCoord.get(k);const xy=toXY(lat,lng),id=nodes.length;nodes.push({id,lat,lng,x:xy.x,y:xy.y,edges:[]});nodeByCoord.set(k,id);const cell=Math.floor(xy.x/CONFIG.gridSize)+','+Math.floor(xy.y/CONFIG.gridSize),bucket=nodeGrid.get(cell);if(bucket)bucket.push(id);else nodeGrid.set(cell,[id]);return id;}
    function edge(from,to,p){if(from<0||to<0||from===to)return;const a=nodes[from],b=nodes[to],distance=Math.hypot(b.x-a.x,b.y-a.y);if(distance<.2)return;const profile=roadProfile(p),duration=distance/(profile.speed/3.6);a.edges.push({from,to,distance,duration,weight:duration*profile.priority,highway:profile.highway,name:roadName(p),ref:String(p&&p.ref||'')});directedEdges+=1;}
    function segment(from,to,p){const a=nodes[from],b=nodes[to],dx=b.x-a.x,dy=b.y-a.y,lengthSq=dx*dx+dy*dy;if(lengthSq<.25)return;const idx=segments.length;segments.push({from,to,ax:a.x,ay:a.y,bx:b.x,by:b.y,dx,dy,lengthSq,length:Math.sqrt(lengthSq),name:roadName(p),highway:String(p&&p.highway||'road')});addGrid(segmentGrid,(a.x+b.x)/2,(a.y+b.y)/2,idx,Math.sqrt(lengthSq)/2+12);}
    function addLine(coords,p){if(!Array.isArray(coords)||coords.length<2)return;const ids=coords.map(nodeFor);for(let i=1;i<ids.length;i+=1){const from=ids[i-1],to=ids[i];if(from<0||to<0)continue;segment(from,to,p);if(reverseOnly(p))edge(to,from,p);else{edge(from,to,p);if(!forwardOnly(p))edge(to,from,p);}}}
    const features=Array.isArray(geojson&&geojson.features)?geojson.features:[];features.forEach(f=>{const g=f&&f.geometry,p=f&&f.properties||{};if(g&&g.type==='LineString')addLine(g.coordinates,p);if(g&&g.type==='MultiLineString')g.coordinates.forEach(line=>addLine(line,p));});
    if(!nodes.length||!directedEdges||!segments.length)throw new Error('Peterborough road data did not contain usable roads.');
    return {nodes,nodeGrid,segments,segmentGrid,directedEdges};
  }

  function clamp(value,min,max){ return Math.max(min,Math.min(max,value)); }
  function percentile(values,fraction){
    const sorted=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
    if(!sorted.length)return 0;
    const index=Math.max(0,Math.min(sorted.length-1,Math.round((sorted.length-1)*fraction)));
    return sorted[index];
  }

  function buildDifficultyIndex(){
    const nodes=state.graph.nodes,distances=new Float64Array(nodes.length),previous=new Int32Array(nodes.length),previousEdge=new Array(nodes.length),sourceStation=new Int16Array(nodes.length),heap=new MinHeap();
    distances.fill(Infinity);previous.fill(-1);sourceStation.fill(-1);
    const stations=basesForService('fire');
    stations.forEach((base,stationIndex)=>{
      const point=basePoint(base),road=nearestRoad(point.lat,point.lng,260);
      if(!road)return;
      distances[road.nodeId]=0;
      sourceStation[road.nodeId]=stationIndex;
      heap.push({id:road.nodeId,score:0});
    });
    while(heap.size){
      const current=heap.pop();
      if(!current||current.score>distances[current.id]+1e-7)continue;
      for(const edge of nodes[current.id].edges){
        const next=distances[current.id]+edge.distance;
        if(next+1e-7>=distances[edge.to])continue;
        distances[edge.to]=next;
        previous[edge.to]=current.id;
        previousEdge[edge.to]=edge;
        sourceStation[edge.to]=sourceStation[current.id];
        heap.push({id:edge.to,score:next});
      }
    }
    state.difficultyIndex={distances,previous,previousEdge,sourceStation,stations};
  }

  function difficultyProfileForNode(nodeId,destinationHighway){
    const index=state.difficultyIndex;
    if(!index||nodeId<0||nodeId>=index.distances.length)return {score:50,routeDistance:0,roadChanges:0,smallApproachRatio:0};
    const routeDistance=index.distances[nodeId];
    if(!Number.isFinite(routeDistance))return {score:65,routeDistance:0,roadChanges:0,smallApproachRatio:0};

    const reverseEdges=[];
    let cursor=nodeId,guard=0;
    while(index.previous[cursor]>=0&&guard++<5000){
      const edge=index.previousEdge[cursor];
      if(!edge)break;
      reverseEdges.push(edge);
      cursor=index.previous[cursor];
    }
    const routeEdges=reverseEdges.reverse();
    let roadChanges=0,lastRoad='';
    for(const edge of routeEdges){
      const road=String(edge.name||edge.ref||'').trim();
      if(!road)continue;
      if(lastRoad&&road!==lastRoad)roadChanges+=1;
      lastRoad=road;
    }

    const smallClasses=new Set(['residential','living_street','service','unclassified','road']);
    let approachDistance=0,smallApproach=0;
    for(let i=routeEdges.length-1;i>=0&&approachDistance<CONFIG.difficultyApproachDistance;i-=1){
      const edge=routeEdges[i],remaining=CONFIG.difficultyApproachDistance-approachDistance,take=Math.min(edge.distance,remaining);
      approachDistance+=take;
      if(smallClasses.has(String(edge.highway||'')))smallApproach+=take;
    }
    const smallApproachRatio=approachDistance>0?smallApproach/approachDistance:0;
    const classPenalty={
      motorway:0,motorway_link:2,trunk:3,trunk_link:4,primary:4,primary_link:5,
      secondary:7,secondary_link:8,tertiary:11,tertiary_link:12,unclassified:17,
      residential:20,road:19,living_street:24,service:26
    }[String(destinationHighway||'road')] ?? 16;

    const distanceScore=clamp((routeDistance-700)/6500*48,0,48);
    const complexityScore=clamp((roadChanges-2)*2.25,0,18);
    const approachScore=clamp(smallApproachRatio*8,0,8);
    const score=Math.round(clamp(distanceScore+classPenalty+complexityScore+approachScore,0,100));
    return {score,routeDistance,roadChanges,smallApproachRatio,classPenalty};
  }

  function scoreCall(call){
    const point=callPoint(call),road=nearestRoad(point.lat,point.lng,650);
    if(!road){
      const stations=basesForService('fire'),nearest=Math.min(...stations.map(base=>dist(point,basePoint(base))));
      const score=Math.round(clamp((nearest-700)/6500*48+16,0,100));
      return {...call,difficulty:score,difficultyDistance:nearest,difficultyRoadClass:'unknown'};
    }
    const profile=difficultyProfileForNode(road.nodeId,road.highway);
    return {...call,difficulty:profile.score,difficultyDistance:profile.routeDistance,difficultyRoadClass:road.highway,difficultyRoad:road.road};
  }

  function connectedCrossStreet(segment){
    const names=new Set();
    for(const nodeId of [segment.from,segment.to]){
      const node=state.graph.nodes[nodeId];
      for(const edge of node?.edges||[]){
        const name=String(edge.name||'').trim();
        if(name&&name!=='Unnamed road'&&name!==segment.name)names.add(name);
      }
    }
    return [...names].sort()[0]||'';
  }

  function buildAdvancedCalls(originalCalls){
    const eligibleClasses=new Set(['tertiary','tertiary_link','unclassified','residential','living_street','service','road']);
    const envelope=buildPeterboroughTrainingEnvelope(originalCalls);
    const existingPoints=originalCalls.map(call=>callPoint(call));
    const originalDistances=originalCalls.map(call=>Number(call.difficultyDistance)).filter(Number.isFinite);
    const originalDifficulty=originalCalls.map(call=>Number(call.difficulty)).filter(Number.isFinite);
    const distanceFloor=Math.max(2200,percentile(originalDistances,.58));
    const difficultyFloor=Math.max(52,percentile(originalDifficulty,.58)+5);
    const fireSubtypes=[...new Set(originalCalls.filter(call=>String(call.main).toLowerCase()==='fire').map(call=>String(call.sub||'Structure Fire')).filter(Boolean))];
    const fallbackSubtypes=['Structure Fire','Burning Complaint','Motor Vehicle Collision','Alarms No Apparent Problem'];
    const subtypes=fireSubtypes.length?fireSubtypes:fallbackSubtypes;
    const candidates=[];

    for(let i=0;i<state.graph.segments.length;i+=1){
      const segment=state.graph.segments[i],highway=String(segment.highway||'road');
      if(!eligibleClasses.has(highway))continue;
      const roadName=String(segment.name||'').trim();
      if(!roadName||roadName==='Unnamed road')continue;
      const a=state.graph.nodes[segment.from],b=state.graph.nodes[segment.to];
      if(!a||!b)continue;
      const fromDistance=state.difficultyIndex.distances[segment.from],toDistance=state.difficultyIndex.distances[segment.to];
      const nodeId=Number.isFinite(fromDistance)&&(!Number.isFinite(toDistance)||fromDistance>=toDistance)?segment.from:segment.to;
      const quickDistance=state.difficultyIndex.distances[nodeId];
      if(!Number.isFinite(quickDistance)||quickDistance<1800)continue;
      const ll=toLatLng((a.x+b.x)/2,(a.y+b.y)/2);
      if(!isPeterboroughTrainingPoint(ll,envelope))continue;
      const profile=difficultyProfileForNode(nodeId,highway);
      candidates.push({
        lat:ll.lat,lng:ll.lng,nodeId,road:roadName,highway,
        difficulty:profile.score,routeDistance:profile.routeDistance,
        crossStreet:connectedCrossStreet(segment),
        rankScore:profile.score*100+Math.min(9999,profile.routeDistance)
      });
    }

    candidates.sort((a,b)=>b.rankScore-a.rankScore||b.routeDistance-a.routeDistance||a.road.localeCompare(b.road)||a.lat-b.lat||a.lng-b.lng);
    const selected=[],roadCounts=new Map();
    const accept=(candidate,strict)=>{
      const count=roadCounts.get(candidate.road)||0;
      if(count>=3)return false;
      if(strict&&(candidate.routeDistance<distanceFloor||candidate.difficulty<difficultyFloor))return false;
      for(const point of existingPoints)if(dist(candidate,point)<145)return false;
      const spacing=strict?CONFIG.advancedMinSpacing:135;
      for(const item of selected)if(dist(candidate,item)<spacing)return false;
      selected.push(candidate);roadCounts.set(candidate.road,count+1);return true;
    };
    for(const candidate of candidates){if(selected.length>=CONFIG.advancedCallCount)break;accept(candidate,true);}
    if(selected.length<CONFIG.advancedCallCount){
      for(const candidate of candidates){if(selected.length>=CONFIG.advancedCallCount)break;if(selected.includes(candidate))continue;accept(candidate,false);}
    }

    return selected.slice(0,CONFIG.advancedCallCount).map((candidate,index)=>{
      const locationLabel=candidate.crossStreet?candidate.road+' & '+candidate.crossStreet:candidate.road;
      return {
        id:'route-advanced-'+String(index+1).padStart(3,'0'),
        main:'Fire',
        sub:subtypes[index%subtypes.length],
        name:'Advanced Route '+String(index+1).padStart(3,'0'),
        addr:locationLabel,
        lat:candidate.lat,
        lng:candidate.lng,
        radius:35,
        advanced:true,
        sources:['route-mapping-advanced'],
        difficulty:candidate.difficulty,
        difficultyDistance:candidate.routeDistance,
        difficultyRoadClass:candidate.highway,
        difficultyRoad:candidate.road
      };
    });
  }

  function buildPeterboroughTrainingEnvelope(calls){
    const points=(calls||[]).map(callPoint).filter(point=>Number.isFinite(point.lat)&&Number.isFinite(point.lng));
    if(!points.length)return null;
    return {
      minLat:Math.min(...points.map(point=>point.lat)),
      maxLat:Math.max(...points.map(point=>point.lat)),
      minLng:Math.min(...points.map(point=>point.lng)),
      maxLng:Math.max(...points.map(point=>point.lng)),
      points
    };
  }

  function isPeterboroughTrainingPoint(point,envelope){
    if(!point||!envelope)return false;
    if(point.lat<envelope.minLat||point.lat>envelope.maxLat||point.lng<envelope.minLng||point.lng>envelope.maxLng)return false;
    let nearest=Infinity;
    for(const existing of envelope.points){
      const distance=dist(point,existing);
      if(distance<nearest)nearest=distance;
      if(nearest<=CONFIG.peterboroughCallProximity)return true;
    }
    return false;
  }

  function defaultProgression(){
    return {completed:0,lastCall:null,updatedAt:0};
  }

  function normalizeProgression(raw){
    const source=raw&&typeof raw==='object'?raw:{};
    const last=source.lastCall&&Number.isFinite(Number(source.lastCall.lat))&&Number.isFinite(Number(source.lastCall.lng))
      ? {id:String(source.lastCall.id||''),name:String(source.lastCall.name||source.lastCall.addr||'Previous Call'),addr:String(source.lastCall.addr||source.lastCall.name||'Previous Call'),lat:Number(source.lastCall.lat),lng:Number(source.lastCall.lng)}
      : null;
    return {completed:Math.max(0,Math.floor(Number(source.completed)||0)),lastCall:last,updatedAt:Number(source.updatedAt)||0};
  }

  function loadProgression(){
    let parsed=null;
    try{parsed=JSON.parse(localStorage.getItem(CONFIG.progressionStorageKey)||'null');}catch(_){}
    state.progression=normalizeProgression(parsed&&parsed.version===1?parsed.progression:null);
  }

  function saveProgression(){
    if(!state.progression)return;
    try{localStorage.setItem(CONFIG.progressionStorageKey,JSON.stringify({version:1,progression:state.progression}));}catch(_){}
  }

  function progressionPhase(){
    const completed=Math.max(0,Number(state.progression?.completed)||0),size=CONFIG.callsPerStationPhase;
    if(completed<size)return {index:0,key:'central',stationNumber:1,label:'Station 1',completedInPhase:completed,rankProgress:completed/size};
    if(completed<size*2)return {index:1,key:'north',stationNumber:2,label:'North Station',completedInPhase:completed-size,rankProgress:(completed-size)/size};
    if(completed<size*3)return {index:2,key:'west',stationNumber:3,label:'West Station',completedInPhase:completed-size*2,rankProgress:(completed-size*2)/size};
    return {index:3,key:'continuous',stationNumber:null,label:'Previous Call',completedInPhase:completed-size*3,rankProgress:1};
  }

  function stationForPhase(phase){
    const stations=basesForService('fire');
    return stations.find(base=>Number(base.number)===Number(phase.stationNumber))||stations[Math.max(0,Math.min(stations.length-1,phase.index))]||null;
  }

  function previousCallBase(lastCall){
    if(!lastCall)return null;
    return {
      id:'previous-call',
      number:0,
      name:'Previous Call',
      shortName:'Previous Call',
      address:lastCall.addr||lastCall.name||'Previous dispatch',
      lat:Number(lastCall.lat),
      lng:Number(lastCall.lng),
      spawnLat:Number(lastCall.lat),
      spawnLng:Number(lastCall.lng),
      spawnHeading:0
    };
  }

  function applyProgressionStart(){
    const phase=progressionPhase();
    state.phase=phase;
    if(phase.index<3){
      const station=stationForPhase(phase);
      if(station)state.base=station;
      return phase;
    }
    const previous=previousCallBase(state.progression?.lastCall);
    if(previous)state.base=previous;
    else{
      const fallback=stationForPhase({index:2,stationNumber:3});
      if(fallback)state.base=fallback;
    }
    return phase;
  }

  function progressionDifficultyTarget(){
    const phase=state.phase||progressionPhase();
    if(phase.index>=3)return null;
    const step=Math.max(0,Math.min(CONFIG.callsPerStationPhase-1,phase.completedInPhase));
    return 12+(step/(CONFIG.callsPerStationPhase-1))*82;
  }

  function recordProgressionCompletion(){
    if(!state.progression||!state.call)return;
    state.progression.completed+=1;
    state.progression.lastCall={
      id:String(state.call.id||''),
      name:String(state.call.name||state.call.addr||'Previous Call'),
      addr:String(state.call.addr||state.call.name||'Previous Call'),
      lat:Number(state.call.lat),
      lng:Number(state.call.lng)
    };
    state.progression.updatedAt=Date.now();
    saveProgression();
  }

  function nearbySegments(x,y,radius){
    const indexes=new Set(),cells=Math.max(1,Math.ceil(radius/CONFIG.gridSize)),cx=Math.floor(x/CONFIG.gridSize),cy=Math.floor(y/CONFIG.gridSize);
    for(let ox=-cells;ox<=cells;ox+=1)for(let oy=-cells;oy<=cells;oy+=1){const b=state.graph.segmentGrid.get((cx+ox)+','+(cy+oy));if(b)b.forEach(i=>indexes.add(i));}
    return indexes;
  }

  function projectToSegment(x,y,s){
    const t=Math.max(0,Math.min(1,((x-s.ax)*s.dx+(y-s.ay)*s.dy)/s.lengthSq)),px=s.ax+s.dx*t,py=s.ay+s.dy*t;
    return {x:px,y:py,t,distance:Math.hypot(x-px,y-py),segment:s};
  }

  function nearestRoad(lat,lng,radius){
    if(!state.graph)return null;const p=toXY(lat,lng);let best=null;
    for(const index of nearbySegments(p.x,p.y,radius||CONFIG.roadSearchRadius)){const pr=projectToSegment(p.x,p.y,state.graph.segments[index]);if(!best||pr.distance<best.distance)best=pr;}
    if(!best||best.distance>(radius||CONFIG.roadSearchRadius))return null;const a=state.graph.nodes[best.segment.from],b=state.graph.nodes[best.segment.to];
    const da=Math.hypot(best.x-a.x,best.y-a.y),db=Math.hypot(best.x-b.x,best.y-b.y),node=da<=db?a:b,ll=toLatLng(best.x,best.y);
    return {lat:ll.lat,lng:ll.lng,distance:best.distance,nodeId:node.id,road:best.segment.name,highway:best.segment.highway};
  }

  function nearestRoadForStroke(point,before,after,preferredRoad){
    if(!state.graph||!point)return null;
    const p=toXY(point.lat,point.lng),a=toXY((before||point).lat,(before||point).lng),b=toXY((after||point).lat,(after||point).lng);
    const vx=b.x-a.x,vy=b.y-a.y,vLength=Math.hypot(vx,vy);
    let best=null,bestScore=Infinity;
    for(const index of nearbySegments(p.x,p.y,CONFIG.roadSearchRadius)){
      const segment=state.graph.segments[index],projection=projectToSegment(p.x,p.y,segment);
      if(projection.distance>CONFIG.roadSearchRadius)continue;
      const segmentLength=Math.max(1,Math.hypot(segment.dx,segment.dy));
      const alignment=vLength>1?Math.abs((vx*segment.dx+vy*segment.dy)/(vLength*segmentLength)):1;
      const directionPenalty=(1-Math.max(0,Math.min(1,alignment)))*CONFIG.strokeDirectionPenalty;
      const continuityBonus=preferredRoad&&segment.name===preferredRoad?CONFIG.strokeRoadContinuityBonus:0;
      const score=projection.distance+directionPenalty-continuityBonus;
      if(score>=bestScore)continue;
      const nodeA=state.graph.nodes[segment.from],nodeB=state.graph.nodes[segment.to];
      const distanceA=Math.hypot(projection.x-nodeA.x,projection.y-nodeA.y),distanceB=Math.hypot(projection.x-nodeB.x,projection.y-nodeB.y);
      const node=distanceA<=distanceB?nodeA:nodeB,ll=toLatLng(projection.x,projection.y);
      bestScore=score;
      best={lat:ll.lat,lng:ll.lng,distance:projection.distance,nodeId:node.id,road:segment.name,highway:segment.highway,alignment};
    }
    return best;
  }

  function heuristic(node,target,objective){const straight=Math.hypot(target.x-node.x,target.y-node.y);return objective==='distance'?straight:straight/(112/3.6)*.82;}
  function edgeCost(edge,objective){return objective==='distance'?edge.distance:edge.weight;}

  function pathBetween(startId,endId,objective){
    if(startId===endId)return {nodeIds:[startId],edges:[],distance:0,duration:0};
    const nodes=state.graph.nodes,target=nodes[endId],scores=new Float64Array(nodes.length),previous=new Int32Array(nodes.length),previousEdge=new Array(nodes.length),heap=new MinHeap();
    scores.fill(Infinity);previous.fill(-1);scores[startId]=0;heap.push({id:startId,score:heuristic(nodes[startId],target,objective)});let visited=0,found=false;
    while(heap.size&&visited<CONFIG.maxVisitedNodes){const cur=heap.pop();if(!cur)break;const expected=scores[cur.id]+heuristic(nodes[cur.id],target,objective);if(cur.score>expected+1e-7)continue;if(cur.id===endId){found=true;break;}visited+=1;for(const e of nodes[cur.id].edges){const next=scores[cur.id]+edgeCost(e,objective);if(next+1e-7>=scores[e.to])continue;scores[e.to]=next;previous[e.to]=cur.id;previousEdge[e.to]=e;heap.push({id:e.to,score:next+heuristic(nodes[e.to],target,objective)});}}
    if(!found)return null;const nodeIds=[],edges=[];let cursor=endId;while(cursor>=0){nodeIds.push(cursor);if(previousEdge[cursor])edges.push(previousEdge[cursor]);if(cursor===startId)break;cursor=previous[cursor];if(cursor<0)return null;}nodeIds.reverse();edges.reverse();return {nodeIds,edges,distance:edges.reduce((s,e)=>s+e.distance,0),duration:edges.reduce((s,e)=>s+e.duration,0)};
  }

  function eraseGraphLoops(edges){
    if(!Array.isArray(edges)||!edges.length)return {edges:[],nodeIds:[],removedDistance:0};
    const keptEdges=[],nodeIds=[edges[0].from],nodePosition=new Map([[edges[0].from,0]]);
    let removedDistance=0;
    for(const edge of edges){
      const current=nodeIds[nodeIds.length-1];
      if(current!==edge.from){
        // A composed route should be connected. If an unexpected discontinuity
        // appears, preserve it rather than inventing a shortcut.
        keptEdges.push(edge);
        if(!nodePosition.has(edge.from)){nodePosition.set(edge.from,nodeIds.length);nodeIds.push(edge.from);}
        if(!nodePosition.has(edge.to)){nodePosition.set(edge.to,nodeIds.length);nodeIds.push(edge.to);}
        continue;
      }
      if(nodePosition.has(edge.to)){
        const keepNodeIndex=nodePosition.get(edge.to);
        removedDistance+=edge.distance;
        while(nodeIds.length-1>keepNodeIndex){
          const removedNode=nodeIds.pop();
          nodePosition.delete(removedNode);
          const removedEdge=keptEdges.pop();
          if(removedEdge)removedDistance+=removedEdge.distance;
        }
        continue;
      }
      keptEdges.push(edge);
      nodeIds.push(edge.to);
      nodePosition.set(edge.to,nodeIds.length-1);
    }
    return {edges:keptEdges,nodeIds,removedDistance};
  }

  function summarizeRoads(edges){const out=[];for(const edge of edges){const name=edge.name==='Unnamed road'?edge.ref:edge.name;if(!name)continue;const last=out[out.length-1];if(last&&last.name===name)last.distance+=edge.distance;else out.push({name,distance:edge.distance});}return out.filter(r=>r.distance>=35).slice(0,8).map(r=>r.name);}

  function composeRoute(anchors,objective){
    if(!Array.isArray(anchors)||anchors.length<2)return null;
    const taggedEdges=[];
    for(let i=0;i<anchors.length-1;i+=1){
      const path=pathBetween(anchors[i].nodeId,anchors[i+1].nodeId,objective);
      if(!path)return {failedLeg:i};
      path.edges.forEach(edge=>taggedEdges.push(Object.assign({_legIndex:i},edge)));
    }

    const cleaned=eraseGraphLoops(taggedEdges),edges=cleaned.edges,coordinates=[],coordinateLegIndex=[];
    const start=anchors[0],end=anchors[anchors.length-1];
    coordinates.push([start.lat,start.lng]);
    coordinateLegIndex.push(0);

    if(edges.length){
      const firstNode=state.graph.nodes[edges[0].from];
      const firstCoordinate=[firstNode.lat,firstNode.lng];
      const firstShown=coordinates[coordinates.length-1];
      if(Math.abs(firstShown[0]-firstCoordinate[0])>1e-10||Math.abs(firstShown[1]-firstCoordinate[1])>1e-10){
        coordinates.push(firstCoordinate);
        coordinateLegIndex.push(edges[0]._legIndex||0);
      }
      for(const edge of edges){
        const node=state.graph.nodes[edge.to],coordinate=[node.lat,node.lng],last=coordinates[coordinates.length-1];
        if(last&&Math.abs(last[0]-coordinate[0])<1e-10&&Math.abs(last[1]-coordinate[1])<1e-10)continue;
        coordinates.push(coordinate);
        coordinateLegIndex.push(edge._legIndex||0);
      }
    }

    const lastCoordinate=coordinates[coordinates.length-1];
    if(!lastCoordinate||Math.abs(lastCoordinate[0]-end.lat)>1e-10||Math.abs(lastCoordinate[1]-end.lng)>1e-10){
      coordinates.push([end.lat,end.lng]);
      coordinateLegIndex.push(Math.max(0,anchors.length-2));
    }

    const firstNode=state.graph.nodes[start.nodeId],lastNode=state.graph.nodes[end.nodeId];
    const firstConnector=dist(start,firstNode),lastConnector=dist(end,lastNode);
    const edgeDistance=edges.reduce((sum,edge)=>sum+edge.distance,0),edgeDuration=edges.reduce((sum,edge)=>sum+edge.duration,0);
    const distance=edgeDistance+(Number.isFinite(firstConnector)?firstConnector:0)+(Number.isFinite(lastConnector)?lastConnector:0);
    const duration=edgeDuration+(Number.isFinite(firstConnector)?firstConnector/12:0)+(Number.isFinite(lastConnector)?lastConnector/9:0);
    return {coordinates,coordinateLegIndex,edges,distance,duration,mainRoads:summarizeRoads(edges),objective,removedLoopDistance:cleaned.removedDistance};
  }

  function rdp(points,tolerance){
    if(points.length<3)return points.slice();const xy=points.map(p=>Object.assign(toXY(p.lat,p.lng),{point:p})),keep=new Uint8Array(points.length);keep[0]=1;keep[points.length-1]=1;const stack=[[0,points.length-1]],tolSq=tolerance*tolerance;
    while(stack.length){const pair=stack.pop(),first=pair[0],last=pair[1],a=xy[first],b=xy[last],dx=b.x-a.x,dy=b.y-a.y,lenSq=dx*dx+dy*dy;let maxSq=0,max=-1;for(let i=first+1;i<last;i+=1){const p=xy[i],t=lenSq?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/lenSq)):0,px=a.x+dx*t,py=a.y+dy*t,d=(p.x-px)*(p.x-px)+(p.y-py)*(p.y-py);if(d>maxSq){maxSq=d;max=i;}}if(max>0&&maxSq>tolSq){keep[max]=1;stack.push([first,max],[max,last]);}}
    return points.filter((p,i)=>keep[i]);
  }

  function resample(points,spacing){
    if(points.length<2)return points.slice();const out=[points[0]];let last=points[0],carry=0;
    for(let i=1;i<points.length;i+=1){let a=last,b=points[i],segment=dist(a,b);if(!Number.isFinite(segment)||segment===0){last=b;continue;}while(carry+segment>=spacing){const t=(spacing-carry)/segment,next={lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t};out.push(next);a=next;segment=dist(a,b);carry=0;}carry+=segment;last=b;}
    out.push(points[points.length-1]);return out;
  }

  function pointSegmentDistanceMeters(point,start,end){
    const p=toXY(point.lat,point.lng),a=toXY(start.lat,start.lng),b=toXY(end.lat,end.lng),dx=b.x-a.x,dy=b.y-a.y,lenSq=dx*dx+dy*dy;
    if(lenSq<1e-6)return Math.hypot(p.x-a.x,p.y-a.y);
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/lenSq)),x=a.x+dx*t,y=a.y+dy*t;
    return Math.hypot(p.x-x,p.y-y);
  }

  function strokeLength(points){
    let total=0;
    for(let i=1;i<points.length;i+=1){const d=dist(points[i-1],points[i]);if(Number.isFinite(d))total+=d;}
    return total;
  }

  function turnAngleDegrees(a,b,c){
    const aa=toXY(a.lat,a.lng),bb=toXY(b.lat,b.lng),cc=toXY(c.lat,c.lng),v1={x:bb.x-aa.x,y:bb.y-aa.y},v2={x:cc.x-bb.x,y:cc.y-bb.y};
    const l1=Math.hypot(v1.x,v1.y),l2=Math.hypot(v2.x,v2.y);
    if(l1<1||l2<1)return 0;
    const cosine=Math.max(-1,Math.min(1,(v1.x*v2.x+v1.y*v2.y)/(l1*l2)));
    return Math.acos(cosine)*180/Math.PI;
  }

  function simplifyStrokeIntent(points){
    if(!Array.isArray(points)||points.length<3)return points.slice();
    const start=points[0],end=points[points.length-1],direct=dist(start,end),travelled=strokeLength(points);
    let maxDeviation=0;
    for(let i=1;i<points.length-1;i+=1)maxDeviation=Math.max(maxDeviation,pointSegmentDistanceMeters(points[i],start,end));
    const straightness=travelled>0?direct/travelled:1;
    const allowedDeviation=Math.min(CONFIG.straightAssistMaxDeviation,Math.max(42,direct*0.045));

    // A mostly straight finger stroke is treated as a straight intention. Small
    // thumb/finger wobble should not become routing waypoints.
    if(direct>180&&straightness>=CONFIG.straightAssistRatio&&maxDeviation<=allowedDeviation)return [start,end];

    let simplified=rdp(points,CONFIG.straightAssistTolerance);
    let changed=true;
    while(changed&&simplified.length>2){
      changed=false;
      const next=[simplified[0]];
      for(let i=1;i<simplified.length-1;i+=1){
        const previous=next[next.length-1],current=simplified[i],following=simplified[i+1];
        const deviation=pointSegmentDistanceMeters(current,previous,following),angle=turnAngleDegrees(previous,current,following);
        const shortLeg=Math.min(dist(previous,current),dist(current,following))<125;
        const weakBend=deviation<CONFIG.weakTurnDeviation&&(angle<CONFIG.weakTurnAngle||shortLeg);
        if(weakBend){changed=true;continue;}
        next.push(current);
      }
      next.push(simplified[simplified.length-1]);
      simplified=next;
    }
    return simplified;
  }

  function pruneMappedAnchors(mapped){
    if(mapped.length<3)return mapped;
    let result=mapped.slice(),changed=true;
    while(changed&&result.length>2){
      changed=false;
      const next=[result[0]];
      for(let i=1;i<result.length-1;i+=1){
        const previous=next[next.length-1],current=result[i],following=result[i+1];
        const deviation=pointSegmentDistanceMeters(current,previous,following),angle=turnAngleDegrees(previous,current,following);
        const sameRoad=previous.road&&current.road&&following.road&&previous.road===current.road&&current.road===following.road;
        if(sameRoad||(deviation<CONFIG.weakTurnDeviation&&angle<CONFIG.weakTurnAngle)){changed=true;continue;}
        next.push(current);
      }
      next.push(result[result.length-1]);
      result=next;
    }
    return result;
  }

  function mappedAnchorsFromStroke(points){
    const intent=simplifyStrokeIntent(points),samples=resample(intent,CONFIG.strokeAnchorSpacing),mapped=[];
    for(let i=0;i<samples.length;i+=1){
      const point=samples[i],before=samples[Math.max(0,i-1)],after=samples[Math.min(samples.length-1,i+1)],previous=mapped[mapped.length-1];
      const road=nearestRoadForStroke(point,before,after,previous?.road||'');
      if(!road)continue;
      if(previous&&previous.nodeId===road.nodeId)continue;
      if(previous&&dist(previous,road)<90&&previous.road===road.road)continue;
      mapped.push(road);
    }
    const pruned=pruneMappedAnchors(mapped);
    if(pruned.length<=CONFIG.maxIntermediateAnchors)return pruned;
    const reduced=[];
    for(let i=0;i<CONFIG.maxIntermediateAnchors;i+=1){
      const index=Math.round(i*(pruned.length-1)/(CONFIG.maxIntermediateAnchors-1)),item=pruned[index];
      if(!reduced.length||reduced[reduced.length-1].nodeId!==item.nodeId)reduced.push(item);
    }
    return reduced;
  }

  function collapseRepeatedNodeLoops(anchors){
    if(!Array.isArray(anchors)||anchors.length<3)return anchors.slice();
    const result=[],seen=new Map();
    for(const anchor of anchors){
      const key=String(anchor.nodeId);
      if(seen.has(key)){
        const keepIndex=seen.get(key);
        result.splice(keepIndex+1);
        for(const [seenKey,index] of [...seen.entries()])if(index>keepIndex)seen.delete(seenKey);
        continue;
      }
      seen.set(key,result.length);
      result.push(anchor);
    }
    return result;
  }

  function routeDistanceForAnchors(anchors){
    const route=composeRoute(anchors,'distance');
    return route&&route.failedLeg===undefined?route.distance:Infinity;
  }

  function collapseRepeatedRoadLoops(anchors){
    if(!Array.isArray(anchors)||anchors.length<4)return anchors.slice();
    let result=anchors.slice(),changed=true;
    while(changed&&result.length>3){
      changed=false;
      outer:for(let i=1;i<result.length-2;i+=1){
        const road=String(result[i].road||'').trim();
        if(!road)continue;
        for(let j=i+2;j<result.length-1;j+=1){
          if(String(result[j].road||'').trim()!==road)continue;
          const via=result.slice(i,j+1);
          const direct=[result[i],result[j]];
          const viaDistance=routeDistanceForAnchors(via),directDistance=routeDistanceForAnchors(direct);
          const savings=viaDistance-directDistance;
          if(Number.isFinite(viaDistance)&&Number.isFinite(directDistance)&&savings>=CONFIG.loopCollapseSavings&&directDistance<=viaDistance*CONFIG.loopCollapseRatio){
            result.splice(i+1,j-i);
            changed=true;
            break outer;
          }
        }
      }
    }
    return result;
  }

  function removeNeedlessDetourAnchors(anchors){
    if(!Array.isArray(anchors)||anchors.length<3)return anchors.slice();
    let result=anchors.slice(),changed=true;
    while(changed&&result.length>2){
      changed=false;
      for(let i=1;i<result.length-1;i+=1){
        const previous=result[i-1],current=result[i],next=result[i+1];
        const viaDistance=routeDistanceForAnchors([previous,current,next]);
        const directDistance=routeDistanceForAnchors([previous,next]);
        const savings=viaDistance-directDistance;
        const sharpBacktrack=turnAngleDegrees(previous,current,next)>118;
        const obviousDetour=Number.isFinite(viaDistance)&&Number.isFinite(directDistance)&&savings>=CONFIG.detourAnchorSavings&&directDistance<=viaDistance*CONFIG.detourAnchorRatio;
        if(sharpBacktrack||obviousDetour){
          result.splice(i,1);
          changed=true;
          break;
        }
      }
    }
    return result;
  }

  function trimAfterClosestDestinationApproach(anchors,destinationPoint){
    if(!Array.isArray(anchors)||anchors.length<2)return anchors.slice();
    let closestIndex=-1,closestDistance=Infinity;
    for(let i=0;i<anchors.length;i+=1){
      const distance=dist(anchors[i],destinationPoint);
      if(distance<closestDistance){closestDistance=distance;closestIndex=i;}
    }
    if(closestIndex<0||closestIndex===anchors.length-1)return anchors.slice();
    const lastDistance=dist(anchors[anchors.length-1],destinationPoint);
    const approachedCall=closestDistance<=CONFIG.destinationApproachRadius;
    const obviousOvershoot=lastDistance>closestDistance+110;
    return approachedCall&&obviousOvershoot?anchors.slice(0,closestIndex+1):anchors.slice();
  }

  function optimizeIntentAnchors(origin,middle,destination){
    let working=[origin,...middle,destination];
    working=collapseRepeatedNodeLoops(working);
    working=collapseRepeatedRoadLoops(working);
    working=removeNeedlessDetourAnchors(working);

    // The origin and dispatch destination are authoritative even when pruning
    // removes noisy anchors around them.
    if(working[0]?.nodeId!==origin.nodeId)working.unshift(origin);
    else working[0]=origin;
    if(working[working.length-1]?.nodeId!==destination.nodeId)working.push(destination);
    else working[working.length-1]=destination;
    return working;
  }

  function cloneAnchors(list){return list.map(a=>({lat:a.lat,lng:a.lng,nodeId:a.nodeId,road:a.road||'',fixed:Boolean(a.fixed)}));}
  function clearLayer(layer){if(layer&&state.map)try{state.map.removeLayer(layer);}catch(_){}}
  function clearLayers(list){list.forEach(clearLayer);list.length=0;}

  function drawCasedRoute(route,color,options){
    const opts=options||{},layers=[];if(!route||route.failedLeg!==undefined)return layers;
    layers.push(L.polyline(route.coordinates,{color:'#07111f',weight:opts.weightCasing||10,opacity:opts.casingOpacity==null?.72:opts.casingOpacity,lineCap:'round',lineJoin:'round',interactive:false,dashArray:opts.dashArray||null}).addTo(state.map));
    layers.push(L.polyline(route.coordinates,{color,weight:opts.weight||6,opacity:opts.opacity==null?.94:opts.opacity,lineCap:'round',lineJoin:'round',interactive:false,dashArray:opts.dashArray||null}).addTo(state.map));return layers;
  }

  function renderPlayerRoute(){
    clearLayers(state.playerLayers);clearLayer(state.interactiveLine);state.interactiveLine=null;if(!state.playerRoute||state.playerRoute.failedLeg!==undefined)return;
    state.playerLayers.push(...drawCasedRoute(state.playerRoute,'#2563eb',{}));
    if(state.mode!=='results'){
      state.interactiveLine=L.polyline(state.playerRoute.coordinates,{color:'#2563eb',weight:30,opacity:.01,lineCap:'round',lineJoin:'round',interactive:true,bubblingMouseEvents:false}).addTo(state.map);
      state.interactiveLine.on('click',onRouteClick);
    }
  }

  function clearReference(){clearLayers(state.referenceLayers);}
  function renderReference(){clearReference();if(state.recommendedRoute)state.referenceLayers.push(...drawCasedRoute(state.recommendedRoute,'#22c55e',{weight:5,weightCasing:9,opacity:.88,casingOpacity:.55,dashArray:'10 9'}));}

  function icon(className,label){return L.divIcon({className:'',html:'<div class="'+className+'">'+label+'</div>',iconSize:[27,27],iconAnchor:[13,13]});}
  function handleIcon(invalid){return L.divIcon({className:'',html:'<div class="route-handle'+(invalid?' invalid':'')+'"></div>',iconSize:[30,30],iconAnchor:[15,15]});}

  function basePoint(base){return {lat:Number(base.spawnLat||base.lat),lng:Number(base.spawnLng||base.lng)};}
  function callPoint(call){return {lat:Number(call.lat),lng:Number(call.lng)};}

  function updateMarkers(){
    clearLayer(state.startMarker);clearLayer(state.callMarker);state.startMarker=null;state.callMarker=null;if(!state.base||!state.call)return;const start=basePoint(state.base),end=callPoint(state.call);
    state.startMarker=L.marker([start.lat,start.lng],{icon:icon('start-icon','START'),interactive:false}).addTo(state.map);
    state.callMarker=L.marker([end.lat,end.lng],{icon:icon('call-icon','CALL'),interactive:false}).addTo(state.map);
  }

  function fitExercise(){if(!state.base||!state.call)return;const s=basePoint(state.base),e=callPoint(state.call);state.map.fitBounds([[s.lat,s.lng],[e.lat,e.lng]],{paddingTopLeft:[45,100],paddingBottomRight:[45,115],maxZoom:15,animate:true});}
  function setHint(text){ui.hint.textContent=text;}
  function setMode(mode){state.mode=mode;document.body.classList.toggle('is-drawing-ready',mode==='drawing');ui.submit.disabled=!(mode==='editing'&&state.playerRoute);ui.undo.disabled=!(mode==='editing'&&state.history.length);ui.clear.disabled=mode==='loading'||mode==='snapping'||mode==='results';ui.results.hidden=mode!=='results';}

  function clearRaw(){clearLayer(state.rawLine);state.rawLine=null;state.rawPoints=[];state.drawingPointer=null;}
  function cancelEdit(){clearLayer(state.editMarker);clearLayer(state.previewLine);state.editMarker=null;state.previewLine=null;state.editDraft=null;}

  function resetDrawing(){
    cancelEdit();clearRaw();clearReference();clearLayers(state.playerLayers);clearLayer(state.interactiveLine);state.interactiveLine=null;state.anchors=[];state.history=[];state.playerRoute=null;state.shortestRoute=null;state.recommendedRoute=null;setMode('drawing');setHint('Draw a route from your base to the call');ui.submit.disabled=true;fitExercise();
  }

  function pointerPoint(event){const rect=ui.map.getBoundingClientRect(),point=L.point(event.clientX-rect.left,event.clientY-rect.top),ll=state.map.containerPointToLatLng(point);return {lat:ll.lat,lng:ll.lng};}

  function onDrawStart(event){
    if(state.mode!=='drawing'||state.drawingPointer!==null||event.button>0)return;event.preventDefault();state.drawingPointer=event.pointerId;ui.drawSurface.setPointerCapture&&ui.drawSurface.setPointerCapture(event.pointerId);const p=pointerPoint(event),start=basePoint(state.base);state.rawPoints=[start,p];state.rawLine=L.polyline([[start.lat,start.lng],[p.lat,p.lng]],{color:'#0ea5e9',weight:6,opacity:.72,dashArray:'5 7',lineCap:'round',lineJoin:'round',interactive:false}).addTo(state.map);setHint('Keep drawing toward the call');
  }
  function onDrawMove(event){if(state.mode!=='drawing'||event.pointerId!==state.drawingPointer)return;event.preventDefault();const p=pointerPoint(event),last=state.rawPoints[state.rawPoints.length-1];if(dist(last,p)<7)return;state.rawPoints.push(p);state.rawLine&&state.rawLine.addLatLng([p.lat,p.lng]);}
  async function onDrawEnd(event){if(state.mode!=='drawing'||event.pointerId!==state.drawingPointer)return;event.preventDefault();state.drawingPointer=null;if(state.rawPoints.length<3){clearRaw();setHint('Draw a little farther along the streets');return;}await snapStroke();}

  async function snapStroke(){
    setMode('snapping');setHint('Snapping your drawing to Peterborough roads…');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    try{
      const mapped=mappedAnchorsFromStroke(state.rawPoints),startPoint=basePoint(state.base),endPoint=callPoint(state.call),origin=nearestRoad(startPoint.lat,startPoint.lng,220),destination=nearestRoad(endPoint.lat,endPoint.lng,CONFIG.destinationSearchRadius);
      if(!origin||!destination)throw new Error('The start or call could not be matched to the Peterborough road network.');state.originAnchor=Object.assign({},origin,startPoint,{fixed:true});state.destinationAnchor=Object.assign({},destination,endPoint,{fixed:true});
      let middle=mapped.filter(a=>a.nodeId!==origin.nodeId&&a.nodeId!==destination.nodeId);
      middle=trimAfterClosestDestinationApproach(middle,endPoint);
      if(middle.length>CONFIG.maxIntermediateAnchors)middle=middle.slice(0,CONFIG.maxIntermediateAnchors);
      let anchors=optimizeIntentAnchors(state.originAnchor,middle,state.destinationAnchor);
      let route=composeRoute(anchors,'distance');
      while(route&&route.failedLeg!==undefined&&anchors.length>2){
        const removeIndex=Math.min(Math.max(1,route.failedLeg+1),anchors.length-2);
        anchors.splice(removeIndex,1);
        anchors=removeNeedlessDetourAnchors(collapseRepeatedNodeLoops(anchors));
        route=composeRoute(anchors,'distance');
      }
      if(!route||route.failedLeg!==undefined)throw new Error('That drawing could not be connected through the road network. Try drawing closer to the streets you want.');
      state.anchors=cloneAnchors(anchors);state.playerRoute=route;state.history=[];clearRaw();renderPlayerRoute();setMode('editing');setHint('Route snapped · tap the blue route to adjust it · pinch to zoom');
      if(!state.firstSnapShown){state.firstSnapShown=true;try{localStorage.setItem('ptboRouteMappingFirstSnap','1');}catch(_){}}
      precomputeReferences();
    }catch(error){console.warn('Route snap failed',error);clearRaw();setMode('drawing');setHint(error.message||'Could not snap that route. Try again.');}
  }

  function precomputeReferences(){
    const direct=[state.originAnchor,state.destinationAnchor];try{state.shortestRoute=composeRoute(direct,'distance');state.recommendedRoute=composeRoute(direct,'recommended');}catch(error){console.warn('Reference routing failed',error);state.shortestRoute=null;state.recommendedRoute=null;}
  }

  function closestRouteIndex(latlng){let best=-1,bestDistance=Infinity;const coords=state.playerRoute&&state.playerRoute.coordinates||[];for(let i=0;i<coords.length;i+=1){const d=state.map.distance(latlng,coords[i]);if(d<bestDistance){bestDistance=d;best=i;}}return best;}

  function onRouteClick(event){
    if(state.mode!=='editing'||!state.playerRoute)return;cancelEdit();const index=closestRouteIndex(event.latlng);if(index<0)return;const legIndex=Number(state.playerRoute.coordinateLegIndex[index]||0),insertAt=Math.max(1,Math.min(state.anchors.length-1,legIndex+1)),road=nearestRoad(event.latlng.lat,event.latlng.lng,120);if(!road)return;
    state.editDraft={insertAt,candidate:road,route:null};state.editMarker=L.marker([road.lat,road.lng],{icon:handleIcon(false),draggable:true,zIndexOffset:2500}).addTo(state.map);if(state.map.getZoom()<CONFIG.routeTapZoom)state.map.flyTo([road.lat,road.lng],CONFIG.routeTapZoom,{duration:.28});setHint('Drag the blue handle onto the road you want');
    state.editMarker.on('dragstart',()=>{state.map.dragging.disable();});
    state.editMarker.on('drag',onEditDrag);
    state.editMarker.on('dragend',onEditEnd);
  }

  function previewEditedRoute(candidate){
    if(!state.editDraft||!candidate)return false;const anchors=cloneAnchors(state.anchors);anchors.splice(state.editDraft.insertAt,0,{lat:candidate.lat,lng:candidate.lng,nodeId:candidate.nodeId,road:candidate.road,fixed:false});const route=composeRoute(anchors,'distance');state.editDraft.candidate=candidate;state.editDraft.anchors=anchors;state.editDraft.route=route&&route.failedLeg===undefined?route:null;clearLayer(state.previewLine);state.previewLine=null;
    if(state.editDraft.route){state.previewLine=L.polyline(state.editDraft.route.coordinates,{color:'#60a5fa',weight:8,opacity:.52,lineCap:'round',lineJoin:'round',interactive:false}).addTo(state.map);state.editMarker.setIcon(handleIcon(false));return true;}state.editMarker.setIcon(handleIcon(true));return false;
  }

  function onEditDrag(event){
    const now=performance.now();if(now-state.lastPreviewAt<110)return;state.lastPreviewAt=now;const ll=event.target.getLatLng(),candidate=nearestRoad(ll.lat,ll.lng,140);if(!candidate){event.target.setIcon(handleIcon(true));return;}event.target.setLatLng([candidate.lat,candidate.lng]);previewEditedRoute(candidate);
  }

  function onEditEnd(event){
    state.map.dragging.enable();const ll=event.target.getLatLng(),candidate=nearestRoad(ll.lat,ll.lng,150);if(candidate)previewEditedRoute(candidate);if(state.editDraft&&state.editDraft.route){state.history.push(cloneAnchors(state.anchors));if(state.history.length>20)state.history.shift();state.anchors=cloneAnchors(state.editDraft.anchors);state.playerRoute=state.editDraft.route;cancelEdit();renderPlayerRoute();setMode('editing');setHint('Route updated · tap another section or Submit Route');}else{cancelEdit();setHint('That road could not make a connected route. Your previous route was kept.');}
  }

  function undo(){if(state.mode!=='editing'||!state.history.length)return;cancelEdit();const anchors=state.history.pop(),route=composeRoute(anchors,'distance');if(route&&route.failedLeg===undefined){state.anchors=cloneAnchors(anchors);state.playerRoute=route;renderPlayerRoute();setHint('Last route adjustment undone');}setMode('editing');}

  function submitRoute(){
    if(state.mode!=='editing'||!state.playerRoute)return;cancelEdit();if(!state.shortestRoute||state.shortestRoute.failedLeg!==undefined||!state.recommendedRoute||state.recommendedRoute.failedLeg!==undefined)precomputeReferences();
    const shortest=state.shortestRoute&&state.shortestRoute.distance,player=state.playerRoute.distance,eff=Number.isFinite(shortest)&&player>0?Math.min(100,shortest/player*100):NaN,extra=Number.isFinite(shortest)?Math.max(0,player-shortest):NaN;
    ui.efficiency.textContent=Number.isFinite(eff)?Math.round(eff)+'% efficient':'Route complete';ui.playerDistance.textContent=formatDistance(player);ui.shortestDistance.textContent=formatDistance(shortest);ui.extraDistance.textContent=Number.isFinite(extra)?'+'+formatDistance(extra):'—';
    const playerRoads=state.playerRoute.mainRoads||[],recommendedRoads=state.recommendedRoute&&state.recommendedRoute.mainRoads||[],different=recommendedRoads.find(name=>name&&!playerRoads.includes(name));
    if(Number.isFinite(eff)&&eff>=97)ui.resultNote.textContent='Very close to the shortest available road route. Green shows the recommended response route.';else if(different)ui.resultNote.textContent='Compare where the green route uses '+different+' instead. Green favours major roads and estimated travel time.';else ui.resultNote.textContent='Blue is your route. Green is the recommended response route.';
    if(Number.isFinite(eff))updateHiddenSkill(eff);
    recordProgressionCompletion();
    clearLayer(state.interactiveLine);state.interactiveLine=null;renderReference();setMode('results');setHint('');
  }

  function callsForService(){const target=state.service==='ems'?'medical':'fire',filtered=state.calls.filter(c=>String(c.main||'').toLowerCase()===target);return filtered.length?filtered:state.calls;}
  function chooseCall(){
    const pool=callsForService(),recent=new Set(state.recentCallIds);
    let fresh=pool.filter(call=>!recent.has(call.id));
    if(state.phase?.index>=3&&state.base){
      const start=basePoint(state.base);
      const spaced=fresh.filter(call=>dist(start,callPoint(call))>=CONFIG.continuousMinNextCallDistance);
      if(spaced.length>=4)fresh=spaced;
    }
    const source=fresh.length?fresh:pool;
    if(!source.length)throw new Error('No dispatch calls are available.');
    const target=adaptiveDifficultyTarget();
    const call=weightedCallChoice(source,target)||source[0];
    state.recentCallIds.push(call.id);
    while(state.recentCallIds.length>CONFIG.recentCalls)state.recentCallIds.shift();
    return call;
  }

  function newCall(){
    cancelEdit();clearRaw();clearReference();clearLayers(state.playerLayers);clearLayer(state.interactiveLine);state.interactiveLine=null;
    const previousPhase=state.phase?.index;
    const phase=applyProgressionStart();
    state.call=chooseCall();state.callCount+=1;state.playerRoute=null;state.shortestRoute=null;state.recommendedRoute=null;state.anchors=[];state.history=[];ui.callNumber.textContent='CALL '+state.callCount;ui.baseLabel.textContent=state.base.shortName||state.base.name;ui.callType.textContent=state.call.sub||state.call.main||'Dispatch Call';ui.callAddress.textContent=state.call.addr||state.call.name;
    const difficulty=clamp(Math.round(Number(state.call.difficulty)||0),0,100);
    ui.difficultyLabel.textContent='DIFFICULTY '+difficulty;
    ui.difficultyLabel.dataset.level=difficulty>=80?'extreme':difficulty>=60?'hard':difficulty>=35?'medium':'easy';
    updateMarkers();fitExercise();setMode('drawing');
    if(previousPhase!==undefined&&previousPhase!==phase.index){
      const message=phase.index===1?'North Station unlocked · routes now start from Station 2'
        :phase.index===2?'West Station unlocked · routes now start from Station 3'
        :phase.index===3?'City mastery mode unlocked · each call now starts at the previous dispatch'
        :'Draw a route to the call';
      setHint(message);
    }else{
      setHint('Draw a route from '+(state.base.shortName||state.base.name)+' to the call');
    }
  }

  function defaultSkillProfile(){
    return {rating:CONFIG.adaptiveDefaultRating,plays:0,confidence:0,highStreak:0,lowStreak:0,history:[],lastTarget:CONFIG.adaptiveDefaultRating,updatedAt:0};
  }

  function normalizeSkillProfile(raw){
    const fallback=defaultSkillProfile(),source=raw&&typeof raw==='object'?raw:{};
    const history=Array.isArray(source.history)?source.history.slice(-CONFIG.adaptiveHistorySize).map(item=>({
      efficiency:clamp(Number(item.efficiency)||0,0,100),
      difficulty:clamp(Number(item.difficulty)||0,0,100),
      rating:clamp(Number(item.rating)||fallback.rating,0,100)
    })):[];
    const plays=Math.max(0,Math.floor(Number(source.plays)||history.length||0));
    return {
      rating:clamp(Number(source.rating)||fallback.rating,3,97),
      plays,
      confidence:clamp(Number(source.confidence)||0,0,1),
      highStreak:Math.max(0,Math.floor(Number(source.highStreak)||0)),
      lowStreak:Math.max(0,Math.floor(Number(source.lowStreak)||0)),
      history,
      lastTarget:clamp(Number(source.lastTarget)||fallback.lastTarget,0,100),
      updatedAt:Number(source.updatedAt)||0
    };
  }

  function loadSkillProfiles(){
    let parsed=null;
    try{parsed=JSON.parse(localStorage.getItem(CONFIG.adaptiveSkillStorageKey)||'null');}catch(_){}
    const profiles=parsed&&parsed.version===1&&parsed.profiles?parsed.profiles:{};
    state.skillProfiles={
      fire:normalizeSkillProfile(profiles.fire),
      ems:normalizeSkillProfile(profiles.ems)
    };
    state.skillProfile=state.skillProfiles[state.service]||state.skillProfiles.fire;
  }

  function saveSkillProfiles(){
    if(!state.skillProfiles)return;
    try{
      localStorage.setItem(CONFIG.adaptiveSkillStorageKey,JSON.stringify({
        version:1,
        profiles:state.skillProfiles
      }));
    }catch(_){}
  }

  function recentSkillHistory(profile,count=CONFIG.adaptiveRecentWindow){
    return (profile?.history||[]).slice(-Math.max(1,count));
  }

  function averageRecentEfficiency(profile){
    const history=recentSkillHistory(profile);
    if(!history.length)return 88;
    return history.reduce((sum,item)=>sum+item.efficiency,0)/history.length;
  }

  function expectedRouteSuccess(rating,difficulty){
    return 1/(1+Math.pow(10,(difficulty-rating)/30));
  }

  function efficiencyOutcome(efficiency){
    return clamp((efficiency-72)/26,0,1);
  }

  function updateHiddenSkill(efficiency){
    const profile=state.skillProfile;
    if(!profile||!Number.isFinite(efficiency)||!state.call)return;
    const difficulty=clamp(Number(state.call.difficulty)||0,0,100);
    const actual=efficiencyOutcome(efficiency);
    const expected=expectedRouteSuccess(profile.rating,difficulty);
    const calibration=profile.plays<CONFIG.adaptiveCalibrationCalls;
    const k=calibration?14:8.5;
    let delta=k*(actual-expected);

    // Loss protection: one distracted or unusual call should not erase several
    // strong performances. Improvement can climb faster than a single miss falls.
    if(delta<0)delta*=0.58;

    if(efficiency>=96){
      profile.highStreak+=1;
      profile.lowStreak=0;
      if(profile.highStreak>=3)delta+=0.7;
      if(profile.highStreak>=5)delta+=0.9;
    }else if(efficiency<=80){
      profile.lowStreak+=1;
      profile.highStreak=0;
      if(profile.lowStreak>=3)delta-=0.5;
    }else{
      profile.highStreak=Math.max(0,profile.highStreak-1);
      profile.lowStreak=Math.max(0,profile.lowStreak-1);
    }

    profile.rating=clamp(profile.rating+delta,3,97);
    profile.plays+=1;
    profile.confidence=clamp(1-Math.exp(-profile.plays/8),0,1);
    profile.history.push({efficiency,difficulty,rating:profile.rating});
    if(profile.history.length>CONFIG.adaptiveHistorySize)profile.history.splice(0,profile.history.length-CONFIG.adaptiveHistorySize);
    profile.updatedAt=Date.now();
    saveSkillProfiles();
  }

  function adaptiveDifficultyTarget(){
    const profile=state.skillProfile||defaultSkillProfile();
    const recent=recentSkillHistory(profile);
    const recentEfficiency=averageRecentEfficiency(profile);
    const calibration=profile.plays<CONFIG.adaptiveCalibrationCalls;

    let target=profile.rating+CONFIG.adaptiveBaseChallenge;
    const phaseTarget=progressionDifficultyTarget();
    if(Number.isFinite(phaseTarget)){
      // Each station has a 20-call hidden rank ladder. Completion determines
      // permanent rank progress; performance still shifts challenge around it.
      target=phaseTarget*0.68+target*0.32;
    }

    // Calibration starts a little easier and ramps quickly when the player
    // demonstrates strong routes.
    if(calibration){
      target=Math.min(target,30+profile.plays*5);
      if(recentEfficiency>=95)target+=4;
    }

    // Momentum: sustained mastery quietly opens harder calls faster.
    if(profile.highStreak>=3)target+=4;
    if(profile.highStreak>=5)target+=5;

    // Struggle protection: two difficult results in a row trigger a subtle
    // breather without revealing that difficulty was adjusted.
    if(profile.lowStreak>=2)target-=8;

    // Rolling performance keeps the system responsive without chasing one score.
    target+=clamp((recentEfficiency-90)*0.45,-5,6);

    // Director-style pacing: occasionally give a stretch challenge or a breather.
    // The weighted call picker still keeps this near the player's skill band.
    const roll=Math.random();
    if(profile.plays>=3&&recentEfficiency>=91&&roll<CONFIG.adaptiveStretchChance)target+=9;
    else if(profile.plays>=3&&roll>1-CONFIG.adaptiveBreatherChance)target-=7;

    // Every seventh completed call can act like a hidden challenge beat when the
    // player is performing well, similar to pacing systems in action games.
    if(profile.plays>0&&profile.plays%7===0&&recentEfficiency>=92)target+=7;

    target=clamp(target,5,98);
    profile.lastTarget=target;
    state.adaptiveTarget=target;
    return target;
  }

  function weightedCallChoice(calls,target){
    if(!calls.length)return null;
    const profile=state.skillProfile||defaultSkillProfile();
    const calibration=profile.plays<CONFIG.adaptiveCalibrationCalls;
    const band=calibration?18:CONFIG.adaptiveCallBand;
    let candidates=calls.filter(call=>Math.abs((Number(call.difficulty)||0)-target)<=band);
    if(candidates.length<4)candidates=calls.filter(call=>Math.abs((Number(call.difficulty)||0)-target)<=band+10);
    if(!candidates.length)candidates=calls.slice();

    const weighted=candidates.map(call=>{
      const difficulty=Number(call.difficulty)||0;
      const gap=Math.abs(difficulty-target);
      let weight=Math.exp(-gap/(calibration?11:7.5));

      // Slightly prefer calls above target when the player is on a mastery streak.
      if(profile.highStreak>=3&&difficulty>=target)weight*=1.22;

      // Keep advanced calls from flooding calibration, then make them more common
      // naturally as the hidden rating reaches their difficulty range.
      if(call.advanced&&profile.plays<CONFIG.adaptiveCalibrationCalls)weight*=0.45;

      return {call,weight:Math.max(.01,weight)};
    });
    const total=weighted.reduce((sum,item)=>sum+item.weight,0);
    let pick=Math.random()*total;
    for(const item of weighted){
      pick-=item.weight;
      if(pick<=0)return item.call;
    }
    return weighted[weighted.length-1].call;
  }

  function basesForService(service){const store=window.PTBO_BASE_STORE;if(store&&typeof store.getBases==='function')return store.getBases(service);const profiles=window.PTBO_SERVICE_CONFIG&&window.PTBO_SERVICE_CONFIG.profiles;return profiles&&profiles[service]?profiles[service].bases||[]:[];}
  function fillBases(service,preferredId){const bases=basesForService(service);ui.baseSelect.innerHTML='';bases.forEach(base=>{const option=document.createElement('option');option.value=base.id;option.textContent=(base.shortName||base.name)+' · '+base.address;ui.baseSelect.appendChild(option);});const wanted=bases.find(b=>b.id===preferredId)||bases[0];if(wanted)ui.baseSelect.value=wanted.id;return wanted;}
  function loadPreferences(){let service='fire';try{service=localStorage.getItem('ptboRouteMappingService')||service;}catch(_){}if(!['fire','ems'].includes(service))service='fire';state.service=service;ui.serviceSelect.value=service;fillBases(service,null);loadSkillProfiles();loadProgression();applyProgressionStart();}
  function savePreferences(){try{localStorage.setItem('ptboRouteMappingService',state.service);localStorage.setItem('ptboRouteMappingBase',state.base.id);}catch(_){}}
  function openSettings(){ui.serviceSelect.value=state.service;fillBases(state.service,state.base&&state.base.id);ui.settingsSheet.hidden=false;}
  function closeSettings(){ui.settingsSheet.hidden=true;}

  function initMap(){
    state.map=L.map('map',{zoomControl:false,attributionControl:true,preferCanvas:true,minZoom:11,maxZoom:19,worldCopyJump:false}).setView([CONFIG.centerLat,CONFIG.centerLng],13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{subdomains:'abc',maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(state.map);
    L.control.zoom({position:'bottomright'}).addTo(state.map);state.map.doubleClickZoom.disable();
  }

  function bindUi(){
    ui.drawSurface.addEventListener('pointerdown',onDrawStart);ui.drawSurface.addEventListener('pointermove',onDrawMove);ui.drawSurface.addEventListener('pointerup',onDrawEnd);ui.drawSurface.addEventListener('pointercancel',onDrawEnd);
    ui.clear.addEventListener('click',resetDrawing);ui.undo.addEventListener('click',undo);ui.submit.addEventListener('click',submitRoute);ui.next.addEventListener('click',newCall);ui.settingsButton.addEventListener('click',openSettings);ui.settingsClose.addEventListener('click',closeSettings);ui.retry.addEventListener('click',()=>location.reload());
    ui.serviceSelect.addEventListener('change',()=>fillBases(ui.serviceSelect.value,null));
    ui.settingsForm.addEventListener('submit',event=>{event.preventDefault();const service=ui.serviceSelect.value;state.service=service;state.skillProfile=state.skillProfiles?.[service]||normalizeSkillProfile(null);if(state.skillProfiles&&!state.skillProfiles[service])state.skillProfiles[service]=state.skillProfile;savePreferences();closeSettings();newCall();});
    ui.settingsSheet.addEventListener('click',event=>{if(event.target===ui.settingsSheet)closeSettings();});
  }

  async function loadData(){
    if(!window.PTBO_DISPATCH_STORE)throw new Error('Shared dispatch store did not load.');
    const calls=await window.PTBO_DISPATCH_STORE.ready();
    const sharedCalls=Array.isArray(calls)?calls:window.PTBO_DISPATCH_STORE.getAll();
    if(!sharedCalls.length)throw new Error('The shared dispatch database is empty.');
    const response=await fetch(CONFIG.roadUrl,{cache:'force-cache'});
    if(!response.ok)throw new Error('Peterborough road data failed to load ('+response.status+').');
    const geojson=await response.json();
    state.graph=buildGraph(geojson);
    buildDifficultyIndex();

    const canonical=sharedCalls.slice(0,CONFIG.canonicalCallCount).map(scoreCall);
    state.originalCalls=canonical;
    state.advancedCalls=buildAdvancedCalls(canonical);
    state.calls=[...state.originalCalls,...state.advancedCalls];
    console.info('Route Mapping call set:',{
      original:state.originalCalls.length,
      advanced:state.advancedCalls.length,
      total:state.calls.length,
      difficultyRange:[
        Math.min(...state.calls.map(call=>call.difficulty)),
        Math.max(...state.calls.map(call=>call.difficulty))
      ]
    });
  }

  function showFailure(error){console.error(error);ui.app.setAttribute('aria-busy','false');ui.errorMessage.textContent=error&&error.message?error.message:String(error||'Unknown startup error');ui.error.hidden=false;setMode('loading');}

  async function initialize(){
    try{initMap();bindUi();loadPreferences();await loadData();applyProgressionStart();if(!state.base)throw new Error('No starting base is available.');ui.app.setAttribute('aria-busy','false');newCall();window.PTBO_ROUTE_MAPPING=Object.freeze({version:VERSION,state,nearestRoad,composeRoute,pathBetween,newCall});}
    catch(error){showFailure(error);}
  }

  initialize();
})();