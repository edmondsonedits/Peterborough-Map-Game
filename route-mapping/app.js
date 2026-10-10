(() => {
  'use strict';

  const VERSION = '1.6.100';
  const CONFIG = Object.freeze({
    roadUrl: '../city-explorer/data/osm-public-roads.geojson',
    centerLat: 44.3091,
    centerLng: -78.3197,
    gridSize: 120,
    roadSearchRadius: 130,
    destinationSearchRadius: 520,
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
    decisionMeaningfulPenalty: 160,
    decisionEqualRouteRatio: 0.035,
    decisionWeaknessMinAge: 2,
    decisionWeaknessMaxAge: 18,
    decisionWeaknessMaxCount: 30,
    maxVisitedNodes: 120000,
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
    error:document.getElementById('loading-error'), errorMessage:document.getElementById('loading-error-message'), retry:document.getElementById('retry-button'), interaction:document.getElementById('interaction-button'), zoomIn:document.getElementById('zoom-in'), zoomOut:document.getElementById('zoom-out'), phaseNote:document.getElementById('phase-note')
  };

  const state = {
    map:null, graph:null, traceCore:null, interaction:'draw', endpointMarker:null, calls:[], originalCalls:[], advancedCalls:[], difficultyIndex:null, service:'fire', base:null, call:null, callCount:0, recentCallIds:[], mode:'loading',
    skillProfiles:null, skillProfile:null, adaptiveTarget:null, progression:null, phase:null, lastDecisionAnalysis:null,
    rawPoints:[], rawLine:null, drawingPointer:null, originAnchor:null, destinationAnchor:null, history:[], playerRoute:null,
    shortestRoute:null, playerLayers:[], referenceLayers:[], startMarker:null, callMarker:null
  };

  function toXY(lat,lng){ return {x:(lng-CONFIG.centerLng)*METERS_PER_LNG,y:(lat-CONFIG.centerLat)*METERS_PER_LAT}; }
  function toLatLng(x,y){ return {lat:y/METERS_PER_LAT+CONFIG.centerLat,lng:x/METERS_PER_LNG+CONFIG.centerLng}; }
  function dist(a,b){ if(!a||!b)return Infinity; const aa=toXY(a.lat,a.lng),bb=toXY(b.lat,b.lng); return Math.hypot(bb.x-aa.x,bb.y-aa.y); }
  function formatDistance(m){ if(!Number.isFinite(m))return '—'; return m<1000?Math.round(m)+' m':(m/1000).toFixed(m<10000?1:0)+' km'; }
  function keyCoord(lng,lat){ return Number(lng).toFixed(7)+','+Number(lat).toFixed(7); }
  function roadProfile(p){ const h=String(p&&p.highway||'road').toLowerCase(); return Object.assign({highway:h},ROAD_PROFILE[h]||ROAD_PROFILE.road); }
  function forwardOnly(p){ const v=String(p?.oneway??'').toLowerCase(); return v==='yes'||v==='true'||v==='1'||(p?.junction==='roundabout'&&!['no','false','0','-1'].includes(v)); }
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
    function edge(from,to,p,segmentId,reverse){if(from<0||to<0||from===to)return;const a=nodes[from],b=nodes[to],distance=Math.hypot(b.x-a.x,b.y-a.y);if(distance<.2)return;const profile=roadProfile(p),duration=distance/(profile.speed/3.6);a.edges.push({from,to,distance,duration,weight:duration*profile.priority,highway:profile.highway,name:roadName(p),ref:String(p&&p.ref||''),segmentId,reverse:Boolean(reverse),bridgeKey:''});directedEdges+=1;}
    function segment(from,to,p){const a=nodes[from],b=nodes[to],dx=b.x-a.x,dy=b.y-a.y,lengthSq=dx*dx+dy*dy;if(lengthSq<.25)return;const idx=segments.length;segments.push({id:idx,forward:!reverseOnly(p),backward:reverseOnly(p)||!forwardOnly(p),bridgeKey:'',bridge:Boolean(p.bridge&&p.bridge!=='no'),layer:String(p.layer||'0'),from,to,ax:a.x,ay:a.y,bx:b.x,by:b.y,dx,dy,lengthSq,length:Math.sqrt(lengthSq),name:roadName(p),highway:String(p&&p.highway||'road')});addGrid(segmentGrid,(a.x+b.x)/2,(a.y+b.y)/2,idx,Math.sqrt(lengthSq)/2+12);return idx;}
    function addLine(coords,p){if(!Array.isArray(coords)||coords.length<2)return;const ids=coords.map(nodeFor);for(let i=1;i<ids.length;i+=1){const from=ids[i-1],to=ids[i];if(from<0||to<0)continue;const segmentId=segment(from,to,p);if(segmentId===undefined)continue;if(reverseOnly(p))edge(to,from,p,segmentId,true);else{edge(from,to,p,segmentId,false);if(!forwardOnly(p))edge(to,from,p,segmentId,true);}}}
    const features=Array.isArray(geojson&&geojson.features)?geojson.features:[];features.forEach(f=>{const g=f&&f.geometry,p=f&&f.properties||{};if(g&&g.type==='LineString')addLine(g.coordinates,p);if(g&&g.type==='MultiLineString')g.coordinates.forEach(line=>addLine(line,p));});
    // A road may cross several bridges. Block only its contiguous tagged structure.
    const atNode=new Map();
    for(const s of segments)if(s.bridge)for(const id of [s.from,s.to]){
      const group=atNode.get(id)||[];group.push(s.id);atNode.set(id,group);
    }
    for(const seed of segments){
      if(!seed.bridge||seed.bridgeKey)continue;
      const bridgeKey='bridge-'+seed.id,stack=[seed];seed.bridgeKey=bridgeKey;
      while(stack.length){
        const s=stack.pop();
        for(const nodeId of [s.from,s.to])for(const id of atNode.get(nodeId)||[]){
          const next=segments[id];
          if(next.bridgeKey||next.layer!==seed.layer)continue;
          next.bridgeKey=bridgeKey;stack.push(next);
        }
      }
    }
    for(const node of nodes)for(const edge of node.edges)edge.bridgeKey=segments[edge.segmentId].bridgeKey;
    if(!nodes.length||!directedEdges||!segments.length)throw new Error('Peterborough road data did not contain usable roads.');
    return {nodes,nodeGrid,segments,segmentGrid,directedEdges,gridSize:CONFIG.gridSize};
  }

  function clamp(value,min,max){ return Math.max(min,Math.min(max,value)); }
  function percentile(values,fraction){
    const sorted=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
    if(!sorted.length)return 0;
    const index=Math.max(0,Math.min(sorted.length-1,Math.round((sorted.length-1)*fraction)));
    return sorted[index];
  }

  function buildDifficultyIndex(startBase){
    const nodes=state.graph.nodes,distances=new Float64Array(nodes.length),previous=new Int32Array(nodes.length),previousEdge=new Array(nodes.length),sourceStation=new Int16Array(nodes.length),heap=new MinHeap();
    distances.fill(Infinity);previous.fill(-1);sourceStation.fill(-1);
    const stations=startBase?[startBase]:basesForService(state.service||'fire');
    stations.forEach((base,stationIndex)=>{
      const point=basePoint(base),road=state.traceCore?.snap(point,260),segment=road&&state.graph.segments[road.segmentId];
      const starts=segment?[
        ...(segment.forward?[{id:segment.to,distance:(1-road.t)*segment.length}]:[]),
        ...(segment.backward?[{id:segment.from,distance:road.t*segment.length}]:[])
      ]:[{id:nearestRoad(point.lat,point.lng,260)?.nodeId,distance:0}];
      for(const start of starts){if(!Number.isInteger(start.id)||start.distance>=distances[start.id])continue;distances[start.id]=start.distance;sourceStation[start.id]=stationIndex;heap.push({id:start.id,score:start.distance});}
    });
    while(heap.size){
      const current=heap.pop();if(current.score>distances[current.id]+1e-7)continue;
      for(const edge of nodes[current.id].edges){
        const next=distances[current.id]+edge.distance;if(next+1e-7>=distances[edge.to])continue;
        distances[edge.to]=next;previous[edge.to]=current.id;previousEdge[edge.to]=edge;sourceStation[edge.to]=sourceStation[current.id];heap.push({id:edge.to,score:next});
      }
    }
    state.difficultyIndex={distances,previous,previousEdge,sourceStation,stations};
  }

  function difficultyProfileForNode(nodeId,destinationHighway){
    const index=state.difficultyIndex;
    if(!index||nodeId<0||nodeId>=index.distances.length)return {score:50,routeDistance:0,roadChanges:0,smallApproachRatio:0,decisionPotential:0,decisionForks:0};
    const routeDistance=index.distances[nodeId];
    if(!Number.isFinite(routeDistance))return {score:65,routeDistance:0,roadChanges:0,smallApproachRatio:0,decisionPotential:0,decisionForks:0};

    const reverseEdges=[],reverseNodes=[nodeId];
    let cursor=nodeId,guard=0;
    while(index.previous[cursor]>=0&&guard++<5000){
      const edge=index.previousEdge[cursor];
      if(!edge)break;
      reverseEdges.push(edge);
      cursor=index.previous[cursor];
      reverseNodes.push(cursor);
    }
    const routeEdges=reverseEdges.reverse(),routeNodes=reverseNodes.reverse();
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

    // Cheap whole-city fork analysis. This identifies routes that repeatedly
    // present believable alternate roads without running a new route search.
    let decisionRaw=0,decisionForks=0,travelled=0;
    const destinationNode=state.graph.nodes[nodeId];
    for(let i=0;i<routeEdges.length;i+=1){
      const edge=routeEdges[i],node=state.graph.nodes[edge.from];
      if(!node||!destinationNode)continue;
      const previousNodeId=i>0?routeEdges[i-1].from:-1;
      const currentToDestination=Math.hypot(destinationNode.x-node.x,destinationNode.y-node.y);
      if(currentToDestination<180){travelled+=edge.distance;continue;}
      const roadNames=new Set();
      let plausible=0,majorPlausible=0;
      for(const alt of node.edges){
        if(alt.to===edge.to||alt.to===previousNodeId)continue;
        const altNode=state.graph.nodes[alt.to];
        if(!altNode)continue;
        const altDistance=Math.hypot(destinationNode.x-altNode.x,destinationNode.y-altNode.y);
        const stillLooksUseful=altDistance<=currentToDestination+Math.max(160,currentToDestination*.14);
        if(!stillLooksUseful)continue;
        const name=String(alt.name||alt.ref||alt.to);
        if(roadNames.has(name))continue;
        roadNames.add(name);plausible+=1;
        if(['motorway','trunk','primary','secondary','tertiary'].includes(String(alt.highway||'')))majorPlausible+=1;
      }
      if(plausible){
        decisionForks+=1;
        const progress=routeDistance>0?travelled/routeDistance:0;
        const earlyBonus=progress<.38?1.18:progress<.68?1.06:1;
        decisionRaw+=Math.min(3,plausible)*(7.5+majorPlausible*1.5)*earlyBonus;
      }
      travelled+=edge.distance;
    }
    const decisionPotential=clamp(decisionRaw+Math.max(0,roadChanges-3)*1.4,0,100);

    const distanceScore=clamp((routeDistance-700)/6500*48,0,48);
    const complexityScore=clamp((roadChanges-2)*2.25,0,18);
    const approachScore=clamp(smallApproachRatio*8,0,8);
    const routeBase=clamp(distanceScore+classPenalty+complexityScore+approachScore,0,100);
    const score=Math.round(clamp(routeBase*.58+decisionPotential*.42,0,100));
    return {score,routeBase,routeDistance,roadChanges,smallApproachRatio,classPenalty,decisionPotential,decisionForks,routeNodes};
  }

  function scoreCall(call){
    const point=callPoint(call),road=nearestRoad(point.lat,point.lng,650);
    if(!road){
      const stations=state.base?[state.base]:basesForService(state.service),nearest=Math.min(...stations.map(base=>dist(point,basePoint(base))));
      const score=Math.round(clamp((nearest-700)/6500*48+16,0,100));
      return {...call,difficulty:score,difficultyDistance:nearest,difficultyRoadClass:'unknown',decisionPotential:0,decisionForks:0};
    }
    const profile=difficultyProfileForNode(road.nodeId,road.highway);
    return {
      ...call,
      difficulty:profile.score,
      routeBaseDifficulty:profile.routeBase,
      decisionPotential:profile.decisionPotential,
      decisionForks:profile.decisionForks,
      difficultyDistance:profile.routeDistance,
      difficultyRoadClass:road.highway,
      difficultyRoad:road.road
    };
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
        decisionPotential:profile.decisionPotential,
        decisionForks:profile.decisionForks,
        rankScore:profile.score*85+profile.decisionPotential*70+Math.min(7000,profile.routeDistance)
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
        decisionPotential:candidate.decisionPotential,
        decisionForks:candidate.decisionForks,
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
    try{parsed=JSON.parse(localStorage.getItem(CONFIG.progressionStorageKey+(state.service==='ems'?':ems':''))||'null');}catch(_){}
    state.progression=normalizeProgression(parsed&&parsed.version===1?parsed.progression:null);
  }

  function saveProgression(){
    if(!state.progression)return;
    try{localStorage.setItem(CONFIG.progressionStorageKey+(state.service==='ems'?':ems':''),JSON.stringify({version:1,progression:state.progression}));}catch(_){}
  }

  function progressionPhase(){
    const completed=Math.max(0,Number(state.progression?.completed)||0),size=CONFIG.callsPerStationPhase,stations=basesForService(state.service),count=Math.max(1,stations.length);
    if(completed<size*count){const index=Math.floor(completed/size),base=stations[index];return {index,key:'station-'+index,stationNumber:base?.number,label:base?.shortName||base?.name||'Base',completedInPhase:completed-index*size,rankProgress:(completed-index*size)/size,continuous:false};}
    return {index:count,key:'continuous',stationNumber:null,label:'Previous Call',completedInPhase:completed-size*count,rankProgress:1,continuous:true};
  }
  function stationForPhase(phase){
    const stations=basesForService(state.service);
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
    if(!phase.continuous){
      const station=stationForPhase(phase);
      if(station)state.base=station;
      return phase;
    }
    const previous=previousCallBase(state.progression?.lastCall);
    if(previous)state.base=previous;
    else{
      const fallback=stationForPhase({index:0,stationNumber:1});
      if(fallback)state.base=fallback;
    }
    return phase;
  }

  function progressionDifficultyTarget(){
    const phase=state.phase||progressionPhase();
    if(phase.continuous)return null;
    const step=Math.max(0,Math.min(CONFIG.callsPerStationPhase-1,phase.completedInPhase));
    return 45+(step/(CONFIG.callsPerStationPhase-1))*40;
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



  function heuristic(node,target,objective){const straight=Math.hypot(target.x-node.x,target.y-node.y);return objective==='distance'?straight:straight/(112/3.6)*.82;}
  function edgeCost(edge,objective){return objective==='distance'?edge.distance:edge.weight;}

  const routePathCache=new Map();
  let cachedRouteGraph=null;
  function pathBetween(startId,endId,objective,constraints={}){
    const graph=state.graph;
    if(graph!==cachedRouteGraph){routePathCache.clear();cachedRouteGraph=graph;}
    if(!Number.isInteger(startId)||!Number.isInteger(endId)||!graph?.nodes[startId]||!graph.nodes[endId])return null;
    const key=objective+':'+startId+':'+endId+':'+(constraints.avoidNode??'')+':'+(constraints.avoidBridge||'')+':'+(constraints.maxDistance??'');
    let result;
    if(routePathCache.has(key)){result=routePathCache.get(key);routePathCache.delete(key);}
    else result=computePathBetween(startId,endId,objective,constraints);
    routePathCache.set(key,result);
    if(routePathCache.size>256)routePathCache.delete(routePathCache.keys().next().value);
    return result?{...result,nodeIds:result.nodeIds.slice(),edges:result.edges.slice()}:null;
  }
  function computePathBetween(startId,endId,objective,constraints={}){
    if(startId===endId)return {nodeIds:[startId],edges:[],distance:0,duration:0};
    const nodes=state.graph.nodes,target=nodes[endId],scores=new Float64Array(nodes.length),previous=new Int32Array(nodes.length),previousEdge=new Array(nodes.length),heap=new MinHeap();
    scores.fill(Infinity);previous.fill(-1);scores[startId]=0;heap.push({id:startId,score:heuristic(nodes[startId],target,objective)});let visited=0,found=false;
    while(heap.size&&visited<CONFIG.maxVisitedNodes){const cur=heap.pop();if(!cur)break;const expected=scores[cur.id]+heuristic(nodes[cur.id],target,objective);if(cur.score>expected+1e-7)continue;if(cur.id===endId){found=true;break;}visited+=1;for(const e of nodes[cur.id].edges){if(e.to===constraints.avoidNode||constraints.avoidBridge&&e.bridgeKey===constraints.avoidBridge)continue;const next=scores[cur.id]+edgeCost(e,objective);if(next>(constraints.maxDistance??Infinity))continue;if(next+1e-7>=scores[e.to])continue;scores[e.to]=next;previous[e.to]=cur.id;previousEdge[e.to]=e;heap.push({id:e.to,score:next+heuristic(nodes[e.to],target,objective)});}}
    if(!found)return null;const nodeIds=[],edges=[];let cursor=endId;while(cursor>=0){nodeIds.push(cursor);if(previousEdge[cursor])edges.push(previousEdge[cursor]);if(cursor===startId)break;cursor=previous[cursor];if(cursor<0)return null;}nodeIds.reverse();edges.reverse();return {nodeIds,edges,distance:edges.reduce((s,e)=>s+e.distance,0),duration:edges.reduce((s,e)=>s+e.duration,0)};
  }

  function composeRoute(anchors){
    if(!state.traceCore||anchors.length<2)return null;
    let route=null;
    for(let i=1;i<anchors.length;i++){
      const leg=state.traceCore.between(anchors[i-1],anchors[i]);
      if(!leg)return {failedLeg:i-1};
      route=state.traceCore.combine(route,leg);
    }
    return route;
  }
  function traceTolerance(){
    if(!state.map)return 24;
    const a=state.map.containerPointToLatLng(L.point(0,0)),b=state.map.containerPointToLatLng(L.point(10,0));
    return clamp(dist(a,b),12,40);
  }
  function setInteraction(value){
    state.interaction=value;
    document.body.classList.toggle('is-drawing-ready',state.mode==='drawing'&&value==='draw');
    if(ui.interaction){ui.interaction.textContent=value==='draw'?'Pan map':'Draw route';ui.interaction.setAttribute('aria-pressed',String(value==='pan'));ui.interaction.disabled=state.mode==='loading'||state.mode==='snapping'||state.mode==='results'||Boolean(state.playerRoute?.complete);}
  }

  function clearLayer(layer){if(layer&&state.map)try{state.map.removeLayer(layer);}catch(_){}}
  function clearLayers(list){list.forEach(clearLayer);list.length=0;}

  function drawCasedRoute(route,color,options){
    const opts=options||{},layers=[];if(!route||route.failedLeg!==undefined)return layers;
    layers.push(L.polyline(route.coordinates,{color:'#07111f',weight:opts.weightCasing||10,opacity:opts.casingOpacity==null?.72:opts.casingOpacity,lineCap:'round',lineJoin:'round',interactive:false,dashArray:opts.dashArray||null}).addTo(state.map));
    layers.push(L.polyline(route.coordinates,{color,weight:opts.weight||6,opacity:opts.opacity==null?.94:opts.opacity,lineCap:'round',lineJoin:'round',interactive:false,dashArray:opts.dashArray||null}).addTo(state.map));return layers;
  }

  function renderPlayerRoute(){
    clearLayers(state.playerLayers);clearLayer(state.endpointMarker);state.endpointMarker=null;
    if(!state.playerRoute)return;
    state.playerLayers.push(...drawCasedRoute(state.playerRoute,'#2563eb',{}));
    if(!state.playerRoute.complete){
      const end=state.playerRoute.endpoint;
      state.endpointMarker=L.marker([end.lat,end.lng],{icon:icon('route-end-icon','END'),interactive:false}).addTo(state.map);
    }
  }

  function clearReference(){clearLayers(state.referenceLayers);}
  function renderReference(){clearReference();if(state.shortestRoute)state.referenceLayers.push(...drawCasedRoute(state.shortestRoute,'#22c55e',{weight:5,weightCasing:9,opacity:.88,casingOpacity:.55,dashArray:'10 9'}));}

  function icon(className,label){return L.divIcon({className:'',html:'<div class="'+className+'">'+label+'</div>',iconSize:[34,34],iconAnchor:[17,17]});}

  function basePoint(base){
    const point={lat:Number(base.spawnLat??base.lat),lng:Number(base.spawnLng??base.lng)};
    // Route drawing begins after leaving the yard, on the public road network.
    const road=state.graph?nearestRoad(point.lat,point.lng,260):null;
    return road?{lat:road.lat,lng:road.lng}:point;
  }
  function callPoint(call){return {lat:Number(call.lat),lng:Number(call.lng)};}
  function callAccessPoint(call){const point=callPoint(call),access=state.traceCore?.snap(point,CONFIG.destinationSearchRadius);return access?{lat:access.lat,lng:access.lng}:point;}

  function updateMarkers(){
    clearLayer(state.startMarker);clearLayer(state.callMarker);state.startMarker=null;state.callMarker=null;if(!state.base||!state.call)return;const start=basePoint(state.base),end=callAccessPoint(state.call);
    state.startMarker=L.marker([start.lat,start.lng],{icon:icon('start-icon','START'),interactive:false}).addTo(state.map);
    state.callMarker=L.marker([end.lat,end.lng],{icon:icon('call-icon','CALL'),title:'Public-road access for '+(state.call.addr||state.call.name),interactive:false}).addTo(state.map);
  }

  function fitExercise(){if(!state.base||!state.call)return;const s=basePoint(state.base),e=callAccessPoint(state.call);state.map.fitBounds([[s.lat,s.lng],[e.lat,e.lng]],{paddingTopLeft:[45,100],paddingBottomRight:[45,115],maxZoom:15,animate:!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches});}
  function setHint(text){ui.hint.textContent=text;}
  function setMode(mode){state.mode=mode;setInteraction(state.interaction);ui.submit.disabled=!(mode==='editing'&&state.playerRoute?.complete);ui.undo.disabled=!(state.history.length&&(mode==='drawing'||mode==='editing'));ui.clear.disabled=mode==='loading'||mode==='snapping'||mode==='results';ui.results.hidden=mode!=='results';}

  function clearRaw(){const pointer=state.drawingPointer;state.drawingPointer=null;if(pointer!==null&&ui.drawSurface.hasPointerCapture?.(pointer))ui.drawSurface.releasePointerCapture(pointer);clearLayer(state.rawLine);state.rawLine=null;state.rawPoints=[];}

  function resetDrawing(){
    exerciseGeneration+=1;clearRaw();clearReference();clearLayers(state.playerLayers);clearLayer(state.endpointMarker);state.endpointMarker=null;
    state.history=[];state.playerRoute=null;state.shortestRoute=null;state.interaction='draw';
    setMode('drawing');setHint('Start at START and follow the streets.');fitExercise();
  }

  function pointerPoint(event){const rect=ui.map.getBoundingClientRect(),point=L.point(event.clientX-rect.left,event.clientY-rect.top),ll=state.map.containerPointToLatLng(point);return {lat:ll.lat,lng:ll.lng};}

  function onDrawStart(event){
    if(state.mode!=='drawing'||state.interaction!=='draw'||state.drawingPointer!==null||event.button>0||ui.settingsSheet.open)return;
    const p=pointerPoint(event),start=state.playerRoute?.endpoint||state.traceCore.snap(basePoint(state.base),260);
    if(!start||dist(p,start)>Math.max(30,traceTolerance()*1.8)){setHint(state.playerRoute?'Continue from the blue END marker.':'Start your drawing at START.');return;}
    event.preventDefault();state.drawingPointer=event.pointerId;ui.drawSurface.setPointerCapture?.(event.pointerId);
    state.rawPoints=[start,p];state.rawLine=L.polyline([[start.lat,start.lng],[p.lat,p.lng]],{color:'#0ea5e9',weight:5,opacity:.8,dashArray:'5 7',interactive:false}).addTo(state.map);
    setHint('Release to stop. Your street choices will be kept.');
  }
  function onDrawMove(event){
    if(state.mode!=='drawing'||event.pointerId!==state.drawingPointer)return;event.preventDefault();
    const p=pointerPoint(event),last=state.rawPoints.at(-1);if(dist(last,p)<5)return;
    state.rawPoints.push(p);state.rawLine?.addLatLng([p.lat,p.lng]);
  }
  async function onDrawEnd(event){
    if(state.mode!=='drawing'||event.pointerId!==state.drawingPointer)return;event.preventDefault();
    const p=pointerPoint(event);if(dist(state.rawPoints.at(-1),p)>.5)state.rawPoints.push(p);
    state.drawingPointer=null;await snapStroke();
  }

  function cancelDrawing(event){
    if(state.drawingPointer===null||(event?.pointerId!==undefined&&event.pointerId!==state.drawingPointer))return;
    clearRaw();setHint('Drawing cancelled · draw your route again');
  }

  let exerciseGeneration=0;
  async function snapStroke(){
    const generation=exerciseGeneration,previous=state.playerRoute;setMode('snapping');setHint('Matching the streets you drew…');
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(generation!==exerciseGeneration||state.mode!=='snapping')return;
    try{
      const trace=state.traceCore.trace(state.rawPoints,{tolerance:traceTolerance()});
      if(trace.distance<3)throw new Error('Draw a little farther along the street.');
      const startPoint=basePoint(state.base),endPoint=callPoint(state.call);
      state.originAnchor=state.traceCore.snap(startPoint,260);state.destinationAnchor=state.traceCore.snap(endPoint,CONFIG.destinationSearchRadius);
      if(!state.destinationAnchor)throw new Error('This call has no road access in the training network.');
      const route=state.traceCore.finish(state.traceCore.combine(previous,trace),state.destinationAnchor,40);
      state.history.push(previous);if(state.history.length>30)state.history.shift();
      state.playerRoute=route;state.shortestRoute=null;clearRaw();renderPlayerRoute();
      state.interaction=route.complete?'pan':'draw';setMode(route.complete?'editing':'drawing');
      setHint(route.complete?'Call road access reached. Submit to compare your decisions.':'Continue from END, or choose Pan map to move and zoom.');
    }catch(error){
      clearRaw();state.playerRoute=previous;setMode(previous?.complete?'editing':'drawing');setHint(error.message||'Trace closer to the streets you want.');
    }
  }
  function precomputeReferences(){
    state.shortestRoute=state.traceCore.between(state.originAnchor,state.destinationAnchor);
  }
  function undo(){
    if(!state.history.length||!['drawing','editing'].includes(state.mode))return;
    clearRaw();state.playerRoute=state.history.pop();state.shortestRoute=null;
    state.interaction='draw';renderPlayerRoute();setMode('drawing');
    setHint(state.playerRoute?'Last stroke undone. Continue from END.':'Last stroke undone. Start at START.');
  }

  function submitRoute(){
    if(state.mode!=='editing'||!state.playerRoute?.complete)return;if(!state.shortestRoute)precomputeReferences();
    const shortest=state.shortestRoute&&state.shortestRoute.distance,player=state.playerRoute.distance,eff=Number.isFinite(shortest)&&player>0?Math.min(100,shortest/player*100):NaN,extra=Number.isFinite(shortest)?Math.max(0,player-shortest):NaN;
    ui.efficiency.textContent=Number.isFinite(eff)?Math.round(eff)+'% efficient':'Route complete';ui.playerDistance.textContent=formatDistance(player);ui.shortestDistance.textContent=formatDistance(shortest);ui.extraDistance.textContent=Number.isFinite(extra)?'+'+formatDistance(extra):'—';
    const playerRoads=state.playerRoute.mainRoads||[],recommendedRoads=state.shortestRoute&&state.shortestRoute.mainRoads||[],different=recommendedRoads.find(name=>name&&!playerRoads.includes(name));
    if(Number.isFinite(eff)&&eff>=97)ui.resultNote.textContent='Efficient route. Green shows a shortest legal route; close alternatives are valid.';else if(different)ui.resultNote.textContent='Compare where the green route uses '+different+' instead. Green shows the shortest legal road route.';else ui.resultNote.textContent='Blue is your route. Green is a shortest legal route.';
    let decisionLearning=null;
    if(Number.isFinite(eff)){
      updateHiddenSkill(eff);
      decisionLearning=updateDecisionLearning();
    }
    if(decisionLearning&&Number.isFinite(extra)){
      ui.resultNote.textContent='Use '+decisionLearning.correctRoad+' instead of '+decisionLearning.chosenRoad+'. That section added '+formatDistance(decisionLearning.extraDistance)+'.';
    }
    recordProgressionCompletion();
    renderReference();setMode('results');setHint('');
  }

  function decisionKey(edge){return window.PTBO_ROUTE_LEARNING.decisionKey(edge);}

  function roadChoicePlausibility(edge,node,destinationNode){
    const altNode=state.graph.nodes[edge.to];
    if(!altNode||!node||!destinationNode)return 0;
    const currentDistance=Math.hypot(destinationNode.x-node.x,destinationNode.y-node.y);
    const alternateDistance=Math.hypot(destinationNode.x-altNode.x,destinationNode.y-altNode.y);
    if(currentDistance<1)return 0;
    const direction=clamp(1-(alternateDistance-currentDistance)/Math.max(240,currentDistance*.38),0,1);
    const roadClass=String(edge.highway||'');
    const familiarRoad=['motorway','trunk','primary','secondary','tertiary'].includes(roadClass)?1:.78;
    return clamp(direction*.72+familiarRoad*.28,0,1);
  }

  function analyzeDecisionDifficulty(call,startBase){
    const baseDifficulty=clamp(Number(call?.difficulty)||0,0,100),fallback={score:baseDifficulty,decisionScore:0,traps:[],meaningfulForks:0};
    if(!state.traceCore||!call||!startBase)return fallback;
    const origin=state.traceCore.snap(basePoint(startBase),260),destination=state.traceCore.snap(callPoint(call),CONFIG.destinationSearchRadius);
    const optimal=state.traceCore.between(origin,destination);
    if(!optimal?.edges.length)return fallback;
    const edges=optimal.edges,traps=[],tolerance=Math.max(CONFIG.decisionMeaningfulPenalty,optimal.distance*CONFIG.decisionEqualRouteRatio);
    function add(correct,penalty,kind,alternateRoad,progress=0){
      if(!Number.isFinite(penalty)||penalty<=tolerance)return;
      const trapScore=clamp((penalty-tolerance)/1100*100*(progress<.3?1.2:1),0,100);
      traps.push({key:decisionKey(correct),nodeId:correct.from,correctRoad:window.PTBO_ROUTE_LEARNING.describe(correct),alternateRoad,penalty,trapScore,progress,kind});
    }
    // A departure is a direction, even when both choices have the same street name.
    const segment=state.graph.segments[origin.segmentId],first=edges[0];
    for(const reverse of [false,true]){
      if(reverse===Boolean(first.reverse)||!(reverse?segment.backward:segment.forward))continue;
      const exitId=reverse?segment.from:segment.to,blockedId=reverse?segment.to:segment.from,exit=state.graph.nodes[exitId];
      const committed={...exit,segmentId:origin.segmentId,t:reverse?0:1};
      const remaining=state.traceCore.between(committed,destination,{avoidNode:blockedId});
      if(remaining)add(first,(reverse?origin.t:1-origin.t)*segment.length+remaining.distance-optimal.distance,'departure',segment.name+' (opposite direction)');
    }
    // Compare whole bridge corridors, rather than assuming an immediate U-turn.
    const bridges=new Set();
    for(let i=0;i<edges.length;i++){
      const edge=edges[i];if(!edge.bridgeKey||bridges.has(edge.bridgeKey))continue;bridges.add(edge.bridgeKey);
      const alternative=state.traceCore.between(origin,destination,{avoidBridge:edge.bridgeKey});
      if(alternative)add(edge,alternative.distance-optimal.distance,'bridge',alternative.edges.find(e=>e.bridgeKey)?.name||'another crossing',i/edges.length);
    }
    const suffix=new Float64Array(edges.length+1);for(let i=edges.length-1;i>=0;i--)suffix[i]=suffix[i+1]+edges[i].distance;
    const candidates=[];
    for(let i=1;i<edges.length;i++){
      const correct=edges[i],node=state.graph.nodes[correct.from],prev=edges[i-1].from;
      if(!node||suffix[i]<220)continue;
      for(const alt of node.edges){
        if(alt.to===correct.to||alt.to===prev)continue;
        const plausibility=roadChoicePlausibility(alt,node,state.graph.nodes[destination.nodeId??state.graph.segments[destination.segmentId].to]);
        if(plausibility<.45)continue;
        candidates.push({correct,alt,index:i,score:plausibility*(i<edges.length*.35?1.2:1)});
      }
    }
    candidates.sort((a,b)=>b.score-a.score);
    const seen=new Set();
    for(const candidate of candidates.slice(0,4)){
      const {correct,alt,index}=candidate,key=decisionKey(correct);if(seen.has(key))continue;seen.add(key);
      const tailAnchor=state.traceCore.snap(state.graph.nodes[alt.to],1);
      const tail=state.traceCore.between(tailAnchor,destination,{avoidNode:correct.from});
      if(tail)add(correct,alt.distance+tail.distance-suffix[index],'turn',alt.name,index/edges.length);
    }
    traps.sort((a,b)=>b.trapScore-a.trapScore);
    const unique=[];const uniqueKeys=new Set();
    for(const trap of traps)if(!uniqueKeys.has(trap.key)){uniqueKeys.add(trap.key);unique.push(trap);}
    const decisionScore=clamp((unique[0]?.trapScore||0)*.65+(unique[1]?.trapScore||0)*.25+unique.length*6,0,100);
    return {score:Math.round(clamp(baseDifficulty*.35+decisionScore*.65,0,100)),decisionScore,traps:unique,meaningfulForks:unique.length,optimalDistance:optimal.distance,optimal};
  }

  function decisionShortlist(calls,target){
    const ranked=calls.map(call=>({call,score:Math.abs((Number(call.difficulty)||0)-target)-(Number(call.decisionPotential)||0)*.16+Math.random()*4})).sort((a,b)=>a.score-b.score);
    const decisionCalls=calls.slice().sort((a,b)=>(Number(b.decisionPotential)||0)-(Number(a.decisionPotential)||0));
    return [...new Map([...ranked.slice(0,8).map(x=>x.call),...decisionCalls.slice(0,4)].map(call=>[call.id,call])).values()];
  }

  function weaknessBoostForAnalysis(analysis){
    const profile=state.skillProfile,weak=profile?.weakDecisions;
    if(!analysis?.traps?.length||!weak)return 1;
    let strongest=0;
    for(const trap of analysis.traps){
      const memory=weak[trap.key];
      if(!memory)continue;
      const age=Math.max(0,(Number(profile.plays)||0)-(Number(memory.lastPlay)||0));
      if(age<CONFIG.decisionWeaknessMinAge||age>CONFIG.decisionWeaknessMaxAge)continue;
      const spacingBonus=age>=4&&age<=10?1.18:1;
      strongest=Math.max(strongest,clamp(Number(memory.score)||0,0,3)*spacingBonus);
    }
    return 1+Math.min(1.25,strongest*.42);
  }

  function analyzeCallShortlist(calls,target){
    const shortlist=decisionShortlist(calls,target);
    return shortlist.map(call=>{
      const analysis=analyzeDecisionDifficulty(call,state.base);
      return {
        ...call,
        sessionDifficulty:analysis.score,
        decisionAnalysis:analysis,
        weaknessBoost:weaknessBoostForAnalysis(analysis)
      };
    });
  }

  function callsForService(){const target=state.service==='ems'?'medical':'fire',filtered=state.calls.filter(c=>String(c.main||'').toLowerCase()===target);return filtered.length?filtered:state.calls;}
  function chooseCall(){
    buildDifficultyIndex(state.base);
    const pool=callsForService().map(scoreCall).filter(call=>Number.isFinite(call.difficultyDistance)&&call.difficultyDistance>0),recent=new Set(state.recentCallIds);
    let fresh=pool.filter(call=>!recent.has(call.id));
    if(state.phase?.continuous&&state.base){
      const start=basePoint(state.base);
      const spaced=fresh.filter(call=>dist(start,callPoint(call))>=CONFIG.continuousMinNextCallDistance);
      if(spaced.length>=4)fresh=spaced;
    }
    const source=fresh.length?fresh:pool;
    if(!source.length)throw new Error('No dispatch calls are available.');
    const target=adaptiveDifficultyTarget();
    const analyzed=analyzeCallShortlist(source,target);
    const call=weightedCallChoice(analyzed.length?analyzed:source,target)||(analyzed[0]||source[0]);
    state.lastDecisionAnalysis=call.decisionAnalysis||null;
    state.recentCallIds.push(call.id);
    while(state.recentCallIds.length>CONFIG.recentCalls)state.recentCallIds.shift();
    return call;
  }

  function newCall(){
    exerciseGeneration+=1;clearRaw();clearReference();clearLayers(state.playerLayers);
    clearLayer(state.endpointMarker);state.endpointMarker=null;state.interaction='draw';
    const previousPhase=state.phase?.index;
    const phase=applyProgressionStart();
    state.call=chooseCall();state.callCount+=1;state.playerRoute=null;state.shortestRoute=null;state.history=[];ui.callNumber.textContent='CALL '+state.callCount;ui.baseLabel.textContent=state.base.shortName||state.base.name;ui.callType.textContent=state.call.sub||state.call.main||'Dispatch Call';ui.callAddress.textContent=state.call.addr||state.call.name;
    const difficulty=clamp(Math.round(Number(state.call.sessionDifficulty??state.call.difficulty)||0),0,100);
    ui.difficultyLabel.textContent=state.call.decisionAnalysis?.traps?.length?'DECISION CHALLENGE':'ROUTE REFRESHER';
    ui.difficultyLabel.dataset.level=difficulty>=80?'extreme':difficulty>=60?'hard':difficulty>=35?'medium':'easy';
    updateMarkers();fitExercise();setMode('drawing');
    if(previousPhase!==undefined&&previousPhase!==phase.index){
      const message=phase.continuous?'Each route now starts at the previous call.':'Routes now start from '+phase.label+'.';
      setHint(message);
    }else{
      setHint('Draw a route from '+(state.base.shortName||state.base.name)+' to CALL road access');
    }
  }

  function defaultSkillProfile(){
    return {rating:CONFIG.adaptiveDefaultRating,plays:0,confidence:0,highStreak:0,lowStreak:0,history:[],weakDecisions:{},lastTarget:CONFIG.adaptiveDefaultRating,updatedAt:0};
  }

  function normalizeSkillProfile(raw){
    const fallback=defaultSkillProfile(),source=raw&&typeof raw==='object'?raw:{};
    const history=Array.isArray(source.history)?source.history.slice(-CONFIG.adaptiveHistorySize).map(item=>({
      efficiency:clamp(Number(item.efficiency)||0,0,100),
      difficulty:clamp(Number(item.difficulty)||0,0,100),
      rating:clamp(Number(item.rating)||fallback.rating,0,100)
    })):[];
    const plays=Math.max(0,Math.floor(Number(source.plays)||history.length||0));
    const weakDecisions={};
    if(source.weakDecisions&&typeof source.weakDecisions==='object'){
      for(const [key,item] of Object.entries(source.weakDecisions)){
        if(!item||typeof item!=='object')continue;
        weakDecisions[key]={
          score:clamp(Number(item.score)||0,0,3),
          lastPlay:Math.max(0,Math.floor(Number(item.lastPlay)||0)),
          exposures:Math.max(0,Math.floor(Number(item.exposures)||0)),
          correctRoad:String(item.correctRoad||''),
          chosenRoad:String(item.chosenRoad||''),
          lat:Number(item.lat)||0,
          lng:Number(item.lng)||0
        };
      }
    }
    return {
      rating:clamp(Number(source.rating)||fallback.rating,3,97),
      plays,
      confidence:clamp(Number(source.confidence)||0,0,1),
      highStreak:Math.max(0,Math.floor(Number(source.highStreak)||0)),
      lowStreak:Math.max(0,Math.floor(Number(source.lowStreak)||0)),
      history,
      weakDecisions,
      lastTarget:clamp(Number(source.lastTarget)||fallback.lastTarget,0,100),
      updatedAt:Number(source.updatedAt)||0
    };
  }

  function loadSkillProfiles(){
    let parsed=null;
    try{parsed=JSON.parse(localStorage.getItem(CONFIG.adaptiveSkillStorageKey)||'null');}catch(_){}
    const profiles=parsed&&[1,2].includes(parsed.version)&&parsed.profiles?parsed.profiles:{};
    if(parsed?.version!==2)for(const profile of Object.values(profiles))if(profile&&typeof profile==='object')profile.weakDecisions={};
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
        version:2,
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
    const difficulty=clamp(Number(state.call.sessionDifficulty??state.call.difficulty)||0,0,100);
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



  function pruneWeakDecisions(profile){
    const entries=Object.entries(profile.weakDecisions||{});
    if(entries.length<=CONFIG.decisionWeaknessMaxCount)return;
    entries.sort((a,b)=>(Number(b[1].score)||0)-(Number(a[1].score)||0)||(Number(b[1].lastPlay)||0)-(Number(a[1].lastPlay)||0));
    const keep=new Set(entries.slice(0,CONFIG.decisionWeaknessMaxCount).map(([key])=>key));
    for(const key of Object.keys(profile.weakDecisions))if(!keep.has(key))delete profile.weakDecisions[key];
  }

  function updateDecisionLearning(){
    const profile=state.skillProfile;if(!profile||!state.shortestRoute)return null;
    const review=window.PTBO_ROUTE_LEARNING.compareChoices(state.playerRoute,state.shortestRoute);
    profile.weakDecisions=profile.weakDecisions||{};
    for(const edge of review.correctDecisions){
      const key=decisionKey(edge),memory=profile.weakDecisions[key];if(!memory)continue;
      memory.score*=.65;if(memory.score<.18)delete profile.weakDecisions[key];
    }
    for(const regret of review.regrets){
      const key=regret.key,existing=profile.weakDecisions[key]||{score:0,exposures:0};
      profile.weakDecisions[key]={score:clamp(existing.score*.72+.5+regret.extra/900,0,3),lastPlay:profile.plays,exposures:existing.exposures+1,correctRoad:window.PTBO_ROUTE_LEARNING.describe(regret.correct),chosenRoad:window.PTBO_ROUTE_LEARNING.describe(regret.chosen),lat:regret.correct.start.lat,lng:regret.correct.start.lng};
    }
    pruneWeakDecisions(profile);saveSkillProfiles();
    const strongest=review.regrets[0];return strongest?{correctRoad:window.PTBO_ROUTE_LEARNING.describe(strongest.correct),chosenRoad:window.PTBO_ROUTE_LEARNING.describe(strongest.chosen),extraDistance:strongest.extra}:null;
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
    const challenges=calls.filter(call=>call.decisionAnalysis?.traps?.length);
    const refreshers=calls.filter(call=>!call.decisionAnalysis?.traps?.length);
    if(challenges.length&&Math.random()<.8)calls=challenges;else if(refreshers.length)calls=refreshers;
    const profile=state.skillProfile||defaultSkillProfile();
    const calibration=profile.plays<CONFIG.adaptiveCalibrationCalls;
    const band=calibration?18:CONFIG.adaptiveCallBand;
    const callDifficulty=call=>Number(call.sessionDifficulty??call.difficulty)||0;
    let candidates=calls.filter(call=>Math.abs(callDifficulty(call)-target)<=band);
    if(candidates.length<4)candidates=calls.filter(call=>Math.abs(callDifficulty(call)-target)<=band+10);
    if(!candidates.length)candidates=calls.slice();

    const weighted=candidates.map(call=>{
      const difficulty=callDifficulty(call);
      const gap=Math.abs(difficulty-target);
      let weight=Math.exp(-gap/(calibration?11:7.5));
      const decisionScore=Number(call.decisionAnalysis?.decisionScore??call.decisionPotential)||0;
      const mastery=clamp(((Number(profile.rating)||0)-25)/70,0,1);
      weight*=1+(decisionScore/100)*(.12+.42*mastery);
      weight*=Number(call.weaknessBoost)||1;

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
  function savePreferences(){try{localStorage.setItem('ptboRouteMappingService',state.service);}catch(_){}}
  function openSettings(){cancelDrawing();ui.serviceSelect.value=state.service;fillBases(state.service,state.base&&state.base.id);ui.phaseNote.textContent=basesForService(state.service).map(b=>b.shortName||b.name).join(' → ')+' → previous call. Each base phase lasts 20 completed calls. CALL marks the nearest mapped public-road access to the address.';if(!ui.settingsSheet.open)ui.settingsSheet.showModal();}
  function closeSettings(){if(ui.settingsSheet.open)ui.settingsSheet.close();}

  function initMap(){
    state.map=L.map('map',{zoomControl:false,attributionControl:true,preferCanvas:true,minZoom:11,maxZoom:19,worldCopyJump:false}).setView([CONFIG.centerLat,CONFIG.centerLng],13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{subdomains:'abc',maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(state.map);
    state.map.doubleClickZoom.disable();
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;if(reduced)state.map.options.zoomAnimation=false;
  }

  function bindUi(){
    ui.drawSurface.addEventListener('pointerdown',onDrawStart);ui.drawSurface.addEventListener('pointermove',onDrawMove);ui.drawSurface.addEventListener('pointerup',onDrawEnd);ui.drawSurface.addEventListener('pointercancel',cancelDrawing);ui.drawSurface.addEventListener('lostpointercapture',cancelDrawing);
    window.addEventListener('blur',()=>{cancelDrawing();});document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelDrawing();}});
    ui.interaction.addEventListener('click',()=>{cancelDrawing();setInteraction(state.interaction==='draw'?'pan':'draw');setHint(state.interaction==='pan'?'Pan or pinch to explore. Choose Draw route to continue.':state.playerRoute?'Continue drawing from END.':'Start your drawing at START.');});
    ui.zoomIn.addEventListener('click',()=>state.map.zoomIn());ui.zoomOut.addEventListener('click',()=>state.map.zoomOut());
    ui.clear.addEventListener('click',resetDrawing);ui.undo.addEventListener('click',undo);ui.submit.addEventListener('click',submitRoute);ui.next.addEventListener('click',newCall);ui.settingsButton.addEventListener('click',openSettings);ui.settingsClose.addEventListener('click',closeSettings);ui.retry.addEventListener('click',()=>location.reload());
    ui.serviceSelect.addEventListener('change',()=>{fillBases(ui.serviceSelect.value,null);ui.phaseNote.textContent=basesForService(ui.serviceSelect.value).map(b=>b.shortName||b.name).join(' → ')+' → previous call. Each base phase lasts 20 completed calls. CALL marks the nearest mapped public-road access to the address.';});
    ui.settingsForm.addEventListener('submit',event=>{event.preventDefault();const service=ui.serviceSelect.value;state.service=service;loadProgression();state.skillProfile=state.skillProfiles?.[service]||normalizeSkillProfile(null);if(state.skillProfiles&&!state.skillProfiles[service])state.skillProfiles[service]=state.skillProfile;savePreferences();closeSettings();newCall();});
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
    state.traceCore=window.PTBO_ROUTE_TRACE.createTraceCore({graph:state.graph,toXY,toLatLng,search:(from,to,options)=>pathBetween(from,to,'distance',options)});
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