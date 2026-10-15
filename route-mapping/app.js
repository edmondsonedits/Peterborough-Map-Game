(() => {
  'use strict';

  const VERSION = window.PTBO_BUILD?.version || '1.6.101';
  const SELECTED_CITY=typeof window!=='undefined'?(window.PTBO_CITY_PACKAGE||{}):{};
  const CITY_CENTER=SELECTED_CITY.map?.center||SELECTED_CITY.map?.defaultCenter||{};
  const CONFIG = Object.freeze({
    roadUrl: '../city-explorer/data/osm-public-roads.geojson',
    centerLat: Number(typeof CITY_CENTER!=='undefined'?(CITY_CENTER.lat??CITY_CENTER[0]):0)||44.3091,
    centerLng: Number(typeof CITY_CENTER!=='undefined'?(CITY_CENTER.lng??CITY_CENTER[1]):0)||-78.3197,
    gridSize: 120,
    roadSearchRadius: 130,
    destinationSearchRadius: 520,
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
    tuningStorageKey: 'ptboRouteMappingTuningV1',
    callsPerStationPhase: 20,
    peterboroughCallProximity: 1400,
    continuousMinNextCallDistance: 850,
    decisionMeaningfulPenalty: 18,
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
    streetForgiveness:document.getElementById('street-forgiveness'), streetForgivenessValue:document.getElementById('street-forgiveness-value'),
    straightPreference:document.getElementById('straight-preference'), straightPreferenceValue:document.getElementById('straight-preference-value'),
    arrivalDistance:document.getElementById('arrival-distance'), arrivalDistanceValue:document.getElementById('arrival-distance-value'),
    challengeFrequency:document.getElementById('challenge-frequency'), challengeFrequencyValue:document.getElementById('challenge-frequency-value'), settingsReset:document.getElementById('settings-reset'),
    error:document.getElementById('loading-error'), errorMessage:document.getElementById('loading-error-message'), retry:document.getElementById('retry-button'), zoomIn:document.getElementById('zoom-in'), zoomOut:document.getElementById('zoom-out'), phaseNote:document.getElementById('phase-note')
  };

  const state = {
    cityId:SELECTED_CITY.id||'peterborough', routeManifest:SELECTED_CITY.route||null, router:null, routerService:null, map:null, graph:null, traceCore:null, endpointMarker:null, calls:[], originalCalls:[], advancedCalls:[], difficultyIndex:null, service:'fire', base:null, call:null, callCount:0, recentCallIds:[], mode:'loading', mapZooming:false,
    skillProfiles:null, skillProfile:null, adaptiveTarget:null, progression:null, phase:null, lastDecisionAnalysis:null, tuning:null,
    stroke:null, drawingPointer:null, originAnchor:null, destinationAnchor:null, history:[], playerRoute:null,
    shortestRoute:null, playerLayers:[], referenceLayers:[], startMarker:null, callMarker:null, mapGestureSnapshot:null
  };

  function toXY(lat,lng){ return {x:(lng-CONFIG.centerLng)*METERS_PER_LNG,y:(lat-CONFIG.centerLat)*METERS_PER_LAT}; }
  function toLatLng(x,y){ return {lat:y/METERS_PER_LAT+CONFIG.centerLat,lng:x/METERS_PER_LNG+CONFIG.centerLng}; }
  function dist(a,b){ if(!a||!b)return Infinity; const aa=toXY(a.lat,a.lng),bb=toXY(b.lat,b.lng); return Math.hypot(bb.x-aa.x,bb.y-aa.y); }
  function formatDistance(m){ if(!Number.isFinite(m))return '—'; return m<1000?Math.round(m)+' m':(m/1000).toFixed(m<10000?1:0)+' km'; }
  function formatTime(seconds){if(!Number.isFinite(seconds))return '—';const whole=Math.max(0,Math.round(seconds));return whole<60?whole+' s':Math.floor(whole/60)+' min '+String(whole%60).padStart(2,'0')+' s';}
  function modeledTime(route){return route?((route.travelSeconds??route.duration??0)+(route.turnSeconds||0)+(route.controlSeconds||0)):NaN;}
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

  function graphBuilder(geojson){
    const nodes=[],nodeByIdentity=new Map(),segments=[],segmentGrid=new Map(),ways=new Map();let directedEdges=0;
    const cost=typeof window!=='undefined'?window.PTBO_ROUTE_COST:null,profile=cost?.createProfile('fire');
    const controlSource=geojson.controls||geojson.nodeControls||{};
    const controlMap=Array.isArray(controlSource)?new Map(controlSource.map(c=>[String(c.nodeId??c.osm_id??c.id),c.tags||c])):new Map(Object.entries(controlSource));
    function nodeFor(c,osmId,p){const lng=Number(c?.[0]),lat=Number(c?.[1]);if(!Number.isFinite(lat)||!Number.isFinite(lng))return -1;const k=osmId!=null?'osm:'+osmId:'legacy:'+keyCoord(lng,lat);if(nodeByIdentity.has(k))return nodeByIdentity.get(k);const xy=toXY(lat,lng),id=nodes.length;nodes.push({id,osmId:osmId!=null?String(osmId):k,lat,lng,x:xy.x,y:xy.y,controls:controlMap.get(String(osmId))||null,edges:[]});nodeByIdentity.set(k,id);return id;}
    function addLine(coords,p,nodeIds,wayId){if(!Array.isArray(coords)||coords.length<2)return;let prev=nodeFor(coords[0],nodeIds?.[0],p);for(let i=1;i<coords.length;i++){
      const next=nodeFor(coords[i],nodeIds?.[i],p),from=prev,to=next;prev=next;if(from<0||to<0||from===to)continue;const a=nodes[from],b=nodes[to],dx=b.x-a.x,dy=b.y-a.y,lengthSq=dx*dx+dy*dy;if(lengthSq<.04)continue;
      const id=segments.length,length=Math.sqrt(lengthSq),s={id,wayId,tags:p,forward:!reverseOnly(p),backward:reverseOnly(p)||!forwardOnly(p),bridgeKey:'',bridge:Boolean(p.bridge&&p.bridge!=='no'),layer:String(p.layer||'0'),from,to,ax:a.x,ay:a.y,bx:b.x,by:b.y,dx,dy,lengthSq,length,name:roadName(p),highway:String(p.highway||'road')};
      segments.push(s);addGrid(segmentGrid,(a.x+b.x)/2,(a.y+b.y)/2,id,length/2+12);
      for(const reverse of [false,true])if(reverse?s.backward:s.forward){const e={from:reverse?to:from,to:reverse?from:to,distance:length,wayId,tags:p,highway:s.highway,name:s.name,ref:String(p.ref||''),segmentId:id,reverse,bridgeKey:''},m=cost?cost.edgeMetrics(e,profile):{travelSeconds:length/(roadProfile(p).speed/3.6),seconds:length/(roadProfile(p).speed/3.6)*roadProfile(p).priority};e.duration=m.travelSeconds;e.weight=m.seconds;nodes[e.from].edges.push(e);directedEdges++;}
    }}
    function addFeature(f,index){const g=f?.geometry,raw=f?.properties||{};if(raw.restrictionMemberOnly)return;const wayId=String(raw.osm_id??raw.osmId??f.id??'legacy-way-'+index);let p=ways.get(wayId);if(!p){const {nodeIds,...tags}=raw;p=tags;ways.set(wayId,p);}if(g?.type==='LineString')addLine(g.coordinates,p,raw.nodeIds,wayId);if(g?.type==='MultiLineString')g.coordinates.forEach((line,i)=>addLine(line,p,Array.isArray(raw.nodeIds?.[i])?raw.nodeIds[i]:null,wayId));}
    function finish(){
      const atNode=new Map();for(const s of segments)if(s.bridge)for(const id of [s.from,s.to]){const group=atNode.get(id)||[];group.push(s.id);atNode.set(id,group);}
      for(const seed of segments){if(!seed.bridge||seed.bridgeKey)continue;const bridgeKey='bridge-'+seed.id,stack=[seed];seed.bridgeKey=bridgeKey;while(stack.length){const s=stack.pop();for(const nodeId of [s.from,s.to])for(const id of atNode.get(nodeId)||[]){const next=segments[id];if(next.bridgeKey||next.layer!==seed.layer)continue;next.bridgeKey=bridgeKey;stack.push(next);}}}
      for(const node of nodes)for(const e of node.edges)e.bridgeKey=segments[e.segmentId].bridgeKey;
      if(!nodes.length||!directedEdges||!segments.length)throw new Error('The selected city road data did not contain usable roads.');
      const parents=Int32Array.from({length:nodes.length},(_,i)=>i),sizes=new Int32Array(nodes.length),named=new Int32Array(nodes.length);function find(i){while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;}function join(a,b){a=find(a);b=find(b);if(a!==b)parents[b]=a;}
      for(const segment of segments){if(!cost||cost.feasible(segment,profile))join(segment.from,segment.to);}for(let i=0;i<nodes.length;i++)sizes[find(i)]++;for(const segment of segments)if(segment.tags.name&&segment.highway!=='service')named[find(segment.from)]++;
      const anyNamed=segments.some(s=>s.tags.name&&s.highway!=='service');for(const segment of segments){const root=find(segment.from);segment.componentId=root;segment.componentSize=sizes[root];segment.roadAccessEligible=(!cost||cost.feasible(segment,profile))&&(!anyNamed||named[root]>0);}
      return {nodes,segments,segmentGrid,directedEdges,gridSize:CONFIG.gridSize,ways,turnRestrictions:geojson.turnRestrictions||[],controls:controlSource,graphVersion:geojson.graphVersion||geojson.properties?.graphVersion||state.routeManifest?.graphVersion||'legacy',costProfileVersion:cost?.VERSION||'legacy'};
    }
    return {addFeature,finish};
  }
  function buildGraph(geojson){const builder=graphBuilder(geojson);(geojson.features||[]).forEach(builder.addFeature);return builder.finish();}
  async function buildGraphAsync(geojson){const builder=graphBuilder(geojson),features=geojson.features||[];for(let i=0;i<features.length;i++){builder.addFeature(features[i],i);if(i%400===399)await new Promise(resolve=>setTimeout(resolve,0));}return builder.finish();}

  function clamp(value,min,max){ return Math.max(min,Math.min(max,value)); }
  const DEFAULT_TUNING=Object.freeze({streetForgiveness:12,straightPreference:35,arrivalDistance:40,challengeFrequency:80});
  function normalizeTuning(raw){
    const source=raw&&typeof raw==='object'?raw:{};
    const bounded=(key,min,max)=>{if(source[key]===null||source[key]===''||source[key]===undefined)return DEFAULT_TUNING[key];const value=Number(source[key]);return Number.isFinite(value)?Math.round(clamp(value,min,max)):DEFAULT_TUNING[key];};
    return {streetForgiveness:bounded('streetForgiveness',6,24),straightPreference:bounded('straightPreference',0,100),arrivalDistance:bounded('arrivalDistance',10,60),challengeFrequency:bounded('challengeFrequency',50,100)};
  }
  function loadTuning(){
    try{return normalizeTuning(JSON.parse(localStorage.getItem(CONFIG.tuningStorageKey)||'null'));}
    catch(_){return normalizeTuning(null);}
  }
  function saveTuning(tuning){
    state.tuning=normalizeTuning(tuning);
    try{localStorage.setItem(CONFIG.tuningStorageKey,JSON.stringify(state.tuning));}catch(_){}
  }
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
    try{parsed=JSON.parse(localStorage.getItem(CONFIG.progressionStorageKey+(state.cityId&&state.cityId!=='peterborough'?':'+state.cityId:'')+(state.service==='ems'?':ems':''))||'null');}catch(_){}
    state.progression=normalizeProgression(parsed&&parsed.version===1?parsed.progression:null);
  }

  function saveProgression(){
    if(!state.progression)return;
    try{localStorage.setItem(CONFIG.progressionStorageKey+(state.cityId&&state.cityId!=='peterborough'?':'+state.cityId:'')+(state.service==='ems'?':ems':''),JSON.stringify({version:1,progression:state.progression}));}catch(_){}
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
    return {lat:ll.lat,lng:ll.lng,distance:best.distance,nodeId:node.id,segmentId:best.segment.id,t:best.t,road:best.segment.name,highway:best.segment.highway};
  }



  function responseProfile(){return (typeof window!=='undefined'?window.PTBO_ROUTE_COST:null)?.createProfile(state.service)||{service:state.service};}
  function responseRouter(){if(!window.PTBO_ROUTE_COST||!state.graph)return null;if(!state.router||state.router.graph!==state.graph||state.routerService!==state.service){const router=window.PTBO_ROUTE_COST.createRouter({graph:state.graph,toLatLng,profile:responseProfile()});router.graph=state.graph;state.router=router;state.routerService=state.service;}return state.router;}
  function snapRoadAccess(point,radius=650,options={}){
    if(!state.graph)return null;const p=toXY(Number(point.lat),Number(point.lng)),cost=typeof window!=='undefined'?window.PTBO_ROUTE_COST:null;let best=null;
    for(const index of nearbySegments(p.x,p.y,radius)){const s=state.graph.segments[index];if(options.wayId!=null&&String(options.wayId)!==String(s.wayId))continue;if(s.roadAccessEligible===false||cost&&!cost.feasible(s,responseProfile()))continue;if(options.base&&s.highway==='service'&&(!s.tags?.name||['driveway','parking_aisle','drive-through'].includes(s.tags?.service)))continue;if(cost?.restricted(s)&&!options.base)continue;const candidate=projectToSegment(p.x,p.y,s);if(candidate.distance>radius)continue;const yard=s.highway==='service'&&(!s.tags?.name||['driveway','parking_aisle','drive-through'].includes(s.tags?.service)),score=candidate.distance+(yard?55:0);if(!best||score<best.score)best={...candidate,score};}
    if(!best)return null;const s=best.segment,node=state.graph.nodes[best.t<=.5?s.from:s.to],ll=toLatLng(best.x,best.y);return {...ll,segmentId:s.id,t:best.t,nodeId:node.id,road:s.name,highway:s.highway,distance:best.distance,wayId:s.wayId};
  }
  function referenceBetween(a,b,options={}){const router=responseRouter();return router?router.between(a,b,{baseAccess:true,...options}):state.traceCore?.between(a,b,options);}

  function heuristic(node,target,objective){const straight=Math.hypot(target.x-node.x,target.y-node.y);return objective==='distance'?straight:straight/(112/3.6)*.82;}
  function edgeCost(edge,objective){return objective==='distance'?edge.distance:edge.weight;}

  const routePathCache=new Map();
  let cachedRouteGraph=null;
  function pathBetween(startId,endId,objective,constraints={}){
    const graph=state.graph;
    if(typeof responseRouter==='function'){const router=responseRouter();if(router)return router.pathBetween(startId,endId,{...constraints,objective:objective==='distance'?'distance':'response',baseAccess:true});}
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
      const leg=referenceBetween(anchors[i-1],anchors[i],{incoming:route?.edges});
      if(!leg)return {failedLeg:i-1};
      route=state.traceCore.combine(route,leg);
    }
    return route;
  }
  function traceTolerance(value=state.tuning){
    const tuning=normalizeTuning(value),map=state.map;
    if(!map)return 24*tuning.streetForgiveness/10;
    const pixels=tuning.streetForgiveness,a=map.containerPointToLatLng(L.point(0,0)),b=map.containerPointToLatLng(L.point(pixels,0));
    return clamp(dist(a,b),12,90);
  }
  function traceOptions(value=state.tuning){const tuning=normalizeTuning(value);return {tolerance:traceTolerance(tuning),directionBias:tuning.straightPreference/100};}
  function arrivalDistance(){return normalizeTuning(state.tuning).arrivalDistance;}
  function updateDrawTarget(anchorOverride){
    const surface=ui.drawSurface,map=state.map;
    if(!surface||!map||!map.latLngToContainerPoint||!map.getSize||!map.getContainer){if(surface)surface.hidden=true;return;}
    if(state.drawingPointer!==null)return; // Keep the capture target stable until release.
    const anchor=anchorOverride||state.playerRoute?.endpoint||(state.base&&state.traceCore?.snap(basePoint(state.base),260));
    const available=state.mode==='drawing'&&!state.mapZooming&&!ui.settingsSheet?.open&&!state.playerRoute?.complete&&Boolean(anchor);
    if(!available){surface.hidden=true;return;}
    const point=map.latLngToContainerPoint(anchor),size=map.getSize();
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.y<0||point.x>size.x||point.y>size.y){surface.hidden=true;return;}
    const rect=map.getContainer().getBoundingClientRect();
    surface.style.left=(rect.left+point.x)+'px';surface.style.top=(rect.top+point.y)+'px';
    surface.setAttribute('aria-label','Drag from '+(state.playerRoute?'END':'START')+' to draw the response route');
    surface.hidden=false;
  }

  function setMapGestureLock(locked){
    if(locked){
      if(state.mapGestureSnapshot||!state.map)return;
      const names=['dragging','touchZoom','scrollWheelZoom','keyboard','doubleClickZoom','boxZoom'];
      const handlers=Object.fromEntries(names.map(name=>{const handler=state.map[name];return[name,Boolean(handler?.enabled?.())];}));
      state.mapGestureSnapshot={handlers,zoomInDisabled:Boolean(ui.zoomIn?.disabled),zoomOutDisabled:Boolean(ui.zoomOut?.disabled)};
      for(const name of names)state.map[name]?.disable?.();
      if(ui.zoomIn)ui.zoomIn.disabled=true;if(ui.zoomOut)ui.zoomOut.disabled=true;
      return;
    }
    const snapshot=state.mapGestureSnapshot;if(!snapshot)return;state.mapGestureSnapshot=null;
    for(const [name,enabled] of Object.entries(snapshot.handlers)){const handler=state.map?.[name];if(enabled)handler?.enable?.();else handler?.disable?.();}
    if(ui.zoomIn)ui.zoomIn.disabled=snapshot.zoomInDisabled;if(ui.zoomOut)ui.zoomOut.disabled=snapshot.zoomOutDisabled;
  }

  function clearLayer(layer){if(layer&&state.map)try{state.map.removeLayer(layer);}catch(_){}}
  function clearLayers(list){list.forEach(clearLayer);list.length=0;}

  function drawCasedRoute(route,color,options){
    const opts=options||{},layers=[];if(!route||route.failedLeg!==undefined)return layers;
    layers.push(L.polyline(route.coordinates,{color:'#07111f',weight:opts.weightCasing||10,opacity:opts.casingOpacity==null?.72:opts.casingOpacity,lineCap:'round',lineJoin:'round',interactive:false,dashArray:opts.dashArray||null}).addTo(state.map));
    layers.push(L.polyline(route.coordinates,{color,weight:opts.weight||6,opacity:opts.opacity==null?.94:opts.opacity,lineCap:'round',lineJoin:'round',interactive:false,dashArray:opts.dashArray||null}).addTo(state.map));return layers;
  }

  function renderPlayerRoute(){
    const route=state.playerRoute;
    if(!route){clearLayers(state.playerLayers);clearLayer(state.endpointMarker);state.endpointMarker=null;return;}
    // Reuse the two line layers during live drawing instead of rebuilding Leaflet
    // objects for every pointer sample. Rendering is scheduled once per frame.
    if(state.playerLayers.length)state.playerLayers.forEach(layer=>layer.setLatLngs(route.coordinates));
    else state.playerLayers.push(...drawCasedRoute(route,'#2563eb',{}));
    if(route.complete){clearLayer(state.endpointMarker);state.endpointMarker=null;}
    else if(state.endpointMarker)state.endpointMarker.setLatLng(route.endpoint);
    else state.endpointMarker=L.marker(route.endpoint,{icon:icon('route-end-icon','END'),interactive:false}).addTo(state.map);
  }

  function clearReference(){clearLayers(state.referenceLayers);}
  function renderReference(){clearReference();if(state.shortestRoute)state.referenceLayers.push(...drawCasedRoute(state.shortestRoute,'#22c55e',{weight:5,weightCasing:9,opacity:.88,casingOpacity:.55,dashArray:'10 9'}));}

  function icon(className,label){return L.divIcon({className:'',html:'<div class="'+className+'">'+label+'</div>',iconSize:[34,34],iconAnchor:[17,17]});}

  function currentAccess(record,source){return Boolean(record&&state.graph&&record.graphVersion===state.graph.graphVersion&&['map-derived','facility-reviewed','verified'].includes(record.reviewStatus)&&Number.isFinite(Number(record.lat))&&Number.isFinite(Number(record.lng))&&Math.abs(Number(record.sourceLat)-Number(source.lat))<1e-7&&Math.abs(Number(record.sourceLng)-Number(source.lng))<1e-7);}
  function baseIdMatches(raw,base=state.base){return Boolean(base&&(String(raw)===String(base.id)||state.service+'-'+raw===String(base.id)));}
  function curatedBaseAccess(base,source){const entries=state.routeManifest?.baseAccess||{};for(const [id,record] of Object.entries(entries))if(baseIdMatches(id,base)&&currentAccess(record,source))return snapRoadAccess(record,30,{base:true,wayId:record.wayId});return null;}
  function callAnchor(call){const point=callPoint(call),record=call.routeAccess;if(!state.graph)return state.traceCore?.snap(point,CONFIG.destinationSearchRadius)||null;if(currentAccess(record,point)){const anchor=snapRoadAccess(record,35,{wayId:record.wayId});if(anchor)return anchor;}return snapRoadAccess(point,CONFIG.destinationSearchRadius);}
  function basePoint(base){
    const point={lat:Number(base.spawnLat??base.lat),lng:Number(base.spawnLng??base.lng)};
    // Route drawing begins after leaving the yard, on the public road network.
    const curated=typeof curatedBaseAccess==='function'?curatedBaseAccess(base,point):null;const road=curated||(state.graph?(typeof snapRoadAccess==='function'?snapRoadAccess(point,650,{base:true}):nearestRoad(point.lat,point.lng,260)):null);
    return road?{lat:road.lat,lng:road.lng}:point;
  }
  function callPoint(call){return {lat:Number(call.lat),lng:Number(call.lng)};}
  function callAccessPoint(call){const point=callPoint(call),access=callAnchor(call);return access?{lat:access.lat,lng:access.lng}:point;}

  function updateMarkers(){
    clearLayer(state.startMarker);clearLayer(state.callMarker);state.startMarker=null;state.callMarker=null;if(!state.base||!state.call)return;const start=basePoint(state.base),end=callAccessPoint(state.call);
    state.startMarker=L.marker([start.lat,start.lng],{icon:icon('start-icon','START'),interactive:false}).addTo(state.map);
    state.callMarker=L.marker([end.lat,end.lng],{icon:icon('call-icon','CALL'),title:'Public-road access for '+(state.call.addr||state.call.name),interactive:false}).addTo(state.map);
  }

  function fitExercise(){if(!state.base||!state.call)return;const s=basePoint(state.base),e=callAccessPoint(state.call);state.map.fitBounds([[s.lat,s.lng],[e.lat,e.lng]],{paddingTopLeft:[45,100],paddingBottomRight:[45,115],maxZoom:15,animate:!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches});}
  function setHint(text){ui.hint.textContent=text;}
  function setMode(mode){state.mode=mode;updateDrawTarget();ui.submit.disabled=!(mode==='editing'&&state.playerRoute?.complete);ui.undo.disabled=!(state.history.length&&(mode==='drawing'||mode==='editing'));ui.clear.disabled=mode==='loading'||mode==='results';ui.results.hidden=mode!=='results';}

  function clearRaw(){
    const pointer=state.drawingPointer,stroke=state.stroke;
    state.drawingPointer=null;state.stroke=null;
    if(stroke?.frame!==null&&stroke?.frame!==undefined)cancelAnimationFrame(stroke.frame);
    setMapGestureLock(false);
    if(pointer!==null&&ui.drawSurface.hasPointerCapture?.(pointer))ui.drawSurface.releasePointerCapture(pointer);
  }

  function resetDrawing(){
    clearRaw();clearReference();clearLayers(state.playerLayers);clearLayer(state.endpointMarker);state.endpointMarker=null;
    state.history=[];state.playerRoute=null;state.shortestRoute=null;
    setMode('drawing');setHint('Drag from START. Backtrack to erase. Release to pause.');fitExercise();
  }

  function pointerPoint(event){const rect=ui.map.getBoundingClientRect(),point=L.point(event.clientX-rect.left,event.clientY-rect.top),ll=state.map.containerPointToLatLng(point);return {lat:ll.lat,lng:ll.lng};}

  function onDrawStart(event){
    if(state.mode!=='drawing'||ui.drawSurface.hidden||state.mapZooming||state.drawingPointer!==null||event.button>0||ui.settingsSheet.open)return;
    let rect=ui.drawSurface.getBoundingClientRect();
    if(Math.hypot(event.clientX-(rect.left+rect.width/2),event.clientY-(rect.top+rect.height/2))>28){setHint(state.playerRoute?'Continue from the blue END marker.':'Start your drawing at START.');return;}
    state.map.stop?.();
    const start=state.playerRoute?.endpoint||state.traceCore.snap(basePoint(state.base),260);
    if(!start){setHint('Start your drawing at START.');return;}
    updateDrawTarget(start);rect=ui.drawSurface.getBoundingClientRect();
    if(ui.drawSurface.hidden||Math.hypot(event.clientX-(rect.left+rect.width/2),event.clientY-(rect.top+rect.height/2))>28){setHint(state.playerRoute?'Continue from the blue END marker.':'Start your drawing at START.');return;}
    const destination=typeof callAnchor==='function'?callAnchor(state.call):state.traceCore.snap(callPoint(state.call),CONFIG.destinationSearchRadius);
    if(!destination){setHint('This call has no road access in the training network.');return;}
    event.preventDefault();
    state.originAnchor=state.traceCore.snap(basePoint(state.base),260);state.destinationAnchor=destination;
    // The grab target is larger than the line: a click within it is not a stroke.
    state.stroke={before:state.playerRoute,point:pointerPoint(event),queue:[],frame:null,changed:false,blocked:false};
    state.playerRoute=state.playerRoute||state.traceCore.begin(start);
    state.drawingPointer=event.pointerId;ui.drawSurface.setPointerCapture?.(event.pointerId);setMapGestureLock(true);
    setHint('Follow streets. Backtrack to erase. Release to pause.');
  }

  function flushStroke(){
    const stroke=state.stroke;if(!stroke)return;
    if(stroke.frame!==null){cancelAnimationFrame(stroke.frame);stroke.frame=null;}
    let changed=false,action='hold';
    for(const point of stroke.queue.splice(0)){
      const result=state.traceCore.advance(state.playerRoute,point,{...traceOptions(),previousPoint:stroke.point});
      stroke.point=point;stroke.blocked=result.blocked;
      if(result.changed){state.playerRoute=result.route;changed=true;stroke.changed=true;state.shortestRoute=null;}
      if(result.action!=='hold')action=result.action;
    }
    if(changed)renderPlayerRoute();
    setHint(stroke.blocked?'Route held at END. Return to a connected street.':action==='erase'?'Erasing the last section. Release to pause.':'Follow streets. Backtrack to erase. Release to pause.');
  }

  function queuePointer(event){
    const stroke=state.stroke;if(!stroke)return;
    const coalesced=event.getCoalescedEvents?.()||[];
    // Preserve the order of high-frequency samples, including turns between frames.
    for(const sample of coalesced.length?coalesced:[event]){
      const point=pointerPoint(sample),last=stroke.queue.at(-1)||stroke.point;
      if(Number.isFinite(point.lat)&&Number.isFinite(point.lng)&&dist(last,point)>.2)stroke.queue.push(point);
    }
    if(stroke.queue.length&&stroke.frame===null)stroke.frame=requestAnimationFrame(flushStroke);
  }
  function onDrawMove(event){
    if(state.mode!=='drawing'||event.pointerId!==state.drawingPointer)return;
    event.preventDefault();queuePointer(event);
  }

  function stopStroke(allowArrival){
    const stroke=state.stroke;if(!stroke)return;
    flushStroke();
    if(stroke.changed){
      let route=state.playerRoute;
      if(allowArrival&&route.distance>.35)route=state.traceCore.finish(route,state.destinationAnchor,arrivalDistance());
      state.history.push(stroke.before);if(state.history.length>30)state.history.shift();
      state.playerRoute=route.distance>.35?route:null;state.shortestRoute=null;
    }else state.playerRoute=stroke.before;
    clearRaw();renderPlayerRoute();setMode(state.playerRoute?.complete?'editing':'drawing');
    setHint(state.playerRoute?.complete?'Call road access reached. Submit to compare your decisions.':state.playerRoute?'Paused. Drag END to continue; drag elsewhere to move the map.':'Drag from START. Backtrack to erase. Release to pause.');
  }
  function onDrawEnd(event){
    if(state.mode!=='drawing'||event.pointerId!==state.drawingPointer)return;
    event.preventDefault();queuePointer(event);stopStroke(true);
  }
  function cancelDrawing(event){
    if(state.drawingPointer===null||(event?.pointerId!==undefined&&event.pointerId!==state.drawingPointer))return;
    // OS interruptions, lost capture and opening settings pause valid work rather
    // than discarding the entire stroke. Clear / Next Call still explicitly reset it.
    stopStroke(false);
  }

  function precomputeReferences(){
    state.shortestRoute=referenceBetween(state.originAnchor,state.destinationAnchor);
  }
  function undo(){
    if(!state.history.length||!['drawing','editing'].includes(state.mode))return;
    clearRaw();state.playerRoute=state.history.pop();state.shortestRoute=null;
    renderPlayerRoute();setMode('drawing');
    setHint(state.playerRoute?'Last stroke undone. Continue from END.':'Last stroke undone. Start at START.');
  }

  function submitRoute(){
    if(state.mode!=='editing'||!state.playerRoute?.complete)return;if(!state.shortestRoute)precomputeReferences();
    const cost=window.PTBO_ROUTE_COST,router=responseRouter();
    if(cost&&router){const a=state.graph.segments[state.originAnchor.segmentId],b=state.graph.segments[state.destinationAnchor.segmentId],opts=router.endpointOptions(cost.restricted(a)?[a.from,a.to]:[],cost.restricted(b)?[b.from,b.to]:[],{baseAccess:true}),metrics=cost.evaluateRoute(state.graph,state.playerRoute.edges,responseProfile(),null,opts);state.playerRoute={...state.playerRoute,...metrics};}
    const shortest=state.shortestRoute&&(state.shortestRoute.seconds??state.shortestRoute.distance),player=state.playerRoute.seconds??state.playerRoute.distance,tolerance=Math.max(18,(shortest||0)*.035),extra=Number.isFinite(shortest)?Math.max(0,player-shortest):NaN,eff=Number.isFinite(shortest)&&player>0?(extra<=tolerance?100:Math.min(100,shortest/player*100)):NaN;
    ui.efficiency.textContent=Number.isFinite(eff)?Math.round(eff)+'% response quality':'Route complete';ui.playerDistance.textContent=formatTime(modeledTime(state.playerRoute));ui.shortestDistance.textContent=formatTime(modeledTime(state.shortestRoute));ui.extraDistance.textContent=Number.isFinite(extra)?'+'+Math.round(extra)+' s':'—';
    const playerRoads=state.playerRoute.mainRoads||[],recommendedRoads=state.shortestRoute?.mainRoads||[],different=recommendedRoads.find(name=>name&&!playerRoads.includes(name));
    if(Number.isFinite(eff)&&eff===100)ui.resultNote.textContent='Practical response route. Close alternatives receive equal credit.';else if(different)ui.resultNote.textContent='Compare the green response route using '+different+'.';else ui.resultNote.textContent='Blue is your route. Green shows a practical response route.';
    let decisionLearning=null;
    if(Number.isFinite(eff)){
      updateHiddenSkill(eff);
      decisionLearning=updateDecisionLearning();
    }
    if(decisionLearning&&Number.isFinite(extra)){
      ui.resultNote.textContent='Use '+decisionLearning.correctRoad+' instead of '+decisionLearning.chosenRoad+'. That section added '+Math.round(decisionLearning.extraDistance)+' modeled seconds.';
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
    const origin=snapRoadAccess(basePoint(startBase),260,{base:true}),destination=typeof callAnchor==='function'?callAnchor(call):state.traceCore.snap(callPoint(call),CONFIG.destinationSearchRadius);
    const optimal=referenceBetween(origin,destination);
    if(!optimal?.edges.length)return fallback;
    const edges=optimal.edges,traps=[],tolerance=Math.max(CONFIG.decisionMeaningfulPenalty,(optimal.seconds??optimal.distance)*CONFIG.decisionEqualRouteRatio);
    function add(correct,penalty,kind,alternateRoad,progress=0){
      if(!Number.isFinite(penalty)||penalty<=tolerance)return;
      const trapScore=clamp((penalty-tolerance)/90*100*(progress<.3?1.2:1),0,100);
      traps.push({key:decisionKey(correct),nodeId:correct.from,correctRoad:window.PTBO_ROUTE_LEARNING.describe(correct),alternateRoad,penalty,trapScore,progress,kind});
    }
    // A departure is a direction, even when both choices have the same street name.
    const segment=state.graph.segments[origin.segmentId],first=edges[0];
    for(const reverse of [false,true]){
      if(reverse===Boolean(first.reverse)||!(reverse?segment.backward:segment.forward))continue;
      const exitId=reverse?segment.from:segment.to,blockedId=reverse?segment.to:segment.from,exit=state.graph.nodes[exitId];
      const committed={...exit,segmentId:origin.segmentId,t:reverse?0:1};
      const remaining=referenceBetween(origin,destination,{startDirection:reverse?'backward':'forward',avoidNode:blockedId});
      if(remaining)add(first,(remaining.seconds??remaining.distance)-(optimal.seconds??optimal.distance),'departure',segment.name+' (opposite direction)');
    }
    // Compare whole bridge corridors, rather than assuming an immediate U-turn.
    const bridges=new Set();
    for(let i=0;i<edges.length;i++){
      const edge=edges[i];if(!edge.bridgeKey||bridges.has(edge.bridgeKey))continue;bridges.add(edge.bridgeKey);
      const alternative=referenceBetween(origin,destination,{avoidBridge:edge.bridgeKey});
      if(alternative)add(edge,(alternative.seconds??alternative.distance)-(optimal.seconds??optimal.distance),'bridge',alternative.edges.find(e=>e.bridgeKey)?.name||'another crossing',i/edges.length);
    }
    const responseCost=window.PTBO_ROUTE_COST,profile=responseCost?responseProfile():null,prefixContexts=new Array(edges.length),edgeSeconds=new Array(edges.length);
    let accessOptions={},context=null;
    if(responseCost){const a=state.graph.segments[origin.segmentId],b=state.graph.segments[destination.segmentId];accessOptions=responseRouter().endpointOptions(responseCost.restricted(a)?[a.from,a.to]:[],responseCost.restricted(b)?[b.from,b.to]:[],{baseAccess:true});}
    for(let i=0;i<edges.length;i++){prefixContexts[i]=context;if(responseCost){const step=responseCost.transitionStep(state.graph,context,edges[i],profile,accessOptions);if(!step)return fallback;edgeSeconds[i]=step.seconds;context=step;}else edgeSeconds[i]=edges[i].distance;}
    const suffix=new Float64Array(edges.length+1);for(let i=edges.length-1;i>=0;i--)suffix[i]=suffix[i+1]+edgeSeconds[i];
    const candidates=[];
    for(let i=1;i<edges.length;i++){
      const correct=edges[i],node=state.graph.nodes[correct.from],prev=edges[i-1].from;
      if(!node||suffix[i]<(responseCost?20:220))continue;
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
      const altSegment=state.graph.segments[alt.segmentId],tailAnchor={...state.graph.nodes[alt.to],segmentId:alt.segmentId,t:alt.reverse?0:1};
      const entry=responseCost?responseCost.transitionStep(state.graph,prefixContexts[index],alt,profile,accessOptions):null;
      if(responseCost&&!entry)continue;
      const tail=referenceBetween(tailAnchor,destination,{avoidNode:correct.from,incoming:entry||[...edges.slice(0,index),alt]});
      if(tail)add(correct,(entry?entry.seconds:alt.distance)+(tail.seconds??tail.distance)-suffix[index],'turn',alt.name,index/edges.length);
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

  function callsForService(){const main=state.service==='ems'?'Medical':'Fire';return state.calls.map(call=>{const profile=call.incidentProfiles?.[state.service];return {...call,main,sub:profile?.sub||call.sub};});}
  function curatedCallsForBase(){if(state.phase?.continuous||!state.routeManifest)return [];const costVersion=window.PTBO_ROUTE_COST?.VERSION,baseSource={lat:Number(state.base?.spawnLat??state.base?.lat),lng:Number(state.base?.spawnLng??state.base?.lng)},baseAccess=Object.entries(state.routeManifest.baseAccess||{}).find(([id])=>baseIdMatches(id));if(!baseAccess||!currentAccess(baseAccess[1],baseSource))return [];
    return callsForService().flatMap(call=>{if(!currentAccess(call.routeAccess,callPoint(call)))return [];const challenge=call.routeChallenges?.find(c=>c.service===state.service&&baseIdMatches(c.baseId)&&c.graphVersion===state.graph.graphVersion&&c.costProfileVersion===costVersion&&['map-derived','facility-reviewed','verified'].includes(c.reviewStatus));return challenge?[{...call,routeChallenge:challenge,difficulty:Number(challenge.difficulty)||50,sessionDifficulty:Number(challenge.difficulty)||50,decisionPotential:75,difficultyDistance:Number(challenge.distance)||1}]:[];});}
  function chooseCuratedCall(){const challenges=curatedCallsForBase();if(challenges.length<3)return null;const recent=new Set(state.recentCallIds),fresh=challenges.filter(call=>!recent.has(call.id)),target=adaptiveDifficultyTarget();let source=fresh.length?fresh:challenges;
    if(Math.random()<.2){const ids=new Set(challenges.map(call=>call.id)),refreshers=callsForService().filter(call=>!ids.has(call.id)&&currentAccess(call.routeAccess,callPoint(call))).sort((a,b)=>dist(basePoint(state.base),callPoint(a))-dist(basePoint(state.base),callPoint(b))).slice(0,2);if(refreshers.length)source=refreshers.map(call=>({...call,difficulty:25,sessionDifficulty:25,decisionPotential:0,difficultyDistance:1}));}
    const call=weightedCallChoice(source,target)||source[0];state.lastDecisionAnalysis=call.routeChallenge?{score:call.difficulty,decisionScore:call.difficulty,traps:[],curated:true}:null;state.recentCallIds.push(call.id);while(state.recentCallIds.length>CONFIG.recentCalls)state.recentCallIds.shift();return call;}
  function chooseCall(){
    const curated=chooseCuratedCall();if(curated)return curated;
    if(state.routeManifest){const recent=new Set(state.recentCallIds),start=basePoint(state.base),target=adaptiveDifficultyTarget(),pool=callsForService().filter(call=>!recent.has(call.id)&&dist(start,callPoint(call))>=(state.phase?.continuous?CONFIG.continuousMinNextCallDistance:250)).map(call=>({...call,difficulty:Math.max(25,...(call.routeChallenges||[]).filter(c=>c.service===state.service).map(c=>Number(c.difficulty)||0))}));const ranked=pool.sort((a,b)=>Math.abs(a.difficulty-target)-Math.abs(b.difficulty-target)).slice(0,12),sample=ranked.sort(()=>Math.random()-.5).slice(0,3),analyzed=sample.map(call=>{const analysis=analyzeDecisionDifficulty(call,state.base);return {...call,decisionAnalysis:analysis,sessionDifficulty:analysis.score,difficulty:analysis.score};}).filter(call=>call.decisionAnalysis.optimal);const source=analyzed.length?analyzed:ranked;if(source.length){const call=weightedCallChoice(source,target)||source[0];state.lastDecisionAnalysis=call.decisionAnalysis||null;state.recentCallIds.push(call.id);while(state.recentCallIds.length>CONFIG.recentCalls)state.recentCallIds.shift();return call;}}
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
    clearRaw();clearReference();clearLayers(state.playerLayers);
    clearLayer(state.endpointMarker);state.endpointMarker=null;
    const previousPhase=state.phase?.index;
    const phase=applyProgressionStart();
    state.call=chooseCall();state.callCount+=1;state.playerRoute=null;state.shortestRoute=null;state.history=[];ui.callNumber.textContent='CALL '+state.callCount;ui.baseLabel.textContent=state.base.shortName||state.base.name;ui.callType.textContent=state.call.sub||state.call.main||'Dispatch Call';ui.callAddress.textContent=state.call.addr||state.call.name;
    const difficulty=clamp(Math.round(Number(state.call.sessionDifficulty??state.call.difficulty)||0),0,100);
    ui.difficultyLabel.textContent=state.call.routeChallenge||state.call.decisionAnalysis?.traps?.length?'DECISION CHALLENGE':'ROUTE REFRESHER';
    ui.difficultyLabel.dataset.level=difficulty>=80?'extreme':difficulty>=60?'hard':difficulty>=35?'medium':'easy';
    updateMarkers();fitExercise();setMode('drawing');
    if(previousPhase!==undefined&&previousPhase!==phase.index){
      const message=phase.continuous?'Each route now starts at the previous call.':'Routes now start from '+phase.label+'.';
      setHint(message);
    }else{
      setHint('Drag from START. Backtrack to erase. Release to pause.');
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
    try{parsed=JSON.parse(localStorage.getItem(CONFIG.adaptiveSkillStorageKey+(state.cityId&&state.cityId!=='peterborough'?':'+state.cityId:''))||'null');}catch(_){}
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
      localStorage.setItem(CONFIG.adaptiveSkillStorageKey+(state.cityId&&state.cityId!=='peterborough'?':'+state.cityId:''),JSON.stringify({
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
      profile.weakDecisions[key]={score:clamp(existing.score*.72+.5+regret.extra/90,0,3),lastPlay:profile.plays,exposures:existing.exposures+1,correctRoad:window.PTBO_ROUTE_LEARNING.describe(regret.correct),chosenRoad:window.PTBO_ROUTE_LEARNING.describe(regret.chosen),lat:regret.correct.start.lat,lng:regret.correct.start.lng};
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
    if(challenges.length&&Math.random()<normalizeTuning(state.tuning).challengeFrequency/100)calls=challenges;else if(refreshers.length)calls=refreshers;
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
  function draftTuning(){return normalizeTuning({streetForgiveness:ui.streetForgiveness?.value,straightPreference:ui.straightPreference?.value,arrivalDistance:ui.arrivalDistance?.value,challengeFrequency:ui.challengeFrequency?.value});}
  function displayTuning(tuning=state.tuning){
    const values=normalizeTuning(tuning);
    for(const [input,value] of [[ui.streetForgiveness,values.streetForgiveness],[ui.straightPreference,values.straightPreference],[ui.arrivalDistance,values.arrivalDistance],[ui.challengeFrequency,values.challengeFrequency]])if(input)input.value=String(value);
    if(ui.streetForgivenessValue){const tolerance=traceTolerance(values);ui.streetForgivenessValue.textContent=values.streetForgiveness+' px · '+Math.round(tolerance)+' m at this zoom';}
    if(ui.straightPreferenceValue)ui.straightPreferenceValue.textContent=values.straightPreference+'%';
    if(ui.arrivalDistanceValue)ui.arrivalDistanceValue.textContent=values.arrivalDistance+' m';
    if(ui.challengeFrequencyValue)ui.challengeFrequencyValue.textContent=values.challengeFrequency+'%';
  }
  function applySettings(service,tuning){
    const serviceChanged=service!==state.service;
    saveTuning(tuning);
    if(serviceChanged){state.service=service;loadProgression();state.skillProfile=state.skillProfiles?.[service]||normalizeSkillProfile(null);if(state.skillProfiles&&!state.skillProfiles[service])state.skillProfiles[service]=state.skillProfile;savePreferences();}
    return serviceChanged;
  }
  function loadPreferences(){state.tuning=loadTuning();displayTuning(state.tuning);let service='fire';try{service=localStorage.getItem('ptboRouteMappingService')||service;}catch(_){}if(!['fire','ems'].includes(service))service='fire';state.service=service;ui.serviceSelect.value=service;fillBases(service,null);loadSkillProfiles();loadProgression();applyProgressionStart();}
  function savePreferences(){try{localStorage.setItem('ptboRouteMappingService',state.service);}catch(_){}}
  function openSettings(){cancelDrawing();ui.serviceSelect.value=state.service;fillBases(state.service,state.base&&state.base.id);displayTuning(state.tuning);ui.phaseNote.textContent=basesForService(state.service).map(b=>b.shortName||b.name).join(' → ')+' → previous call. Each base phase lasts 20 completed calls. CALL marks the nearest mapped public-road access to the address.';if(!ui.settingsSheet.open)ui.settingsSheet.showModal();updateDrawTarget();}
  function closeSettings(){if(ui.settingsSheet.open)ui.settingsSheet.close();updateDrawTarget();}

  function initMap(){
    state.map=L.map('map',{zoomControl:false,attributionControl:true,preferCanvas:true,minZoom:Number(SELECTED_CITY.map?.minZoom)||8,maxZoom:19,worldCopyJump:false}).setView([CONFIG.centerLat,CONFIG.centerLng],Number(SELECTED_CITY.map?.defaultZoom)||13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{subdomains:'abc',maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(state.map);
    state.map.doubleClickZoom.disable();
    state.map.on('zoomstart',()=>{state.mapZooming=true;updateDrawTarget();});
    state.map.on('zoomend',()=>{state.mapZooming=false;updateDrawTarget();});
    state.map.on('move resize',()=>updateDrawTarget());
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;if(reduced)state.map.options.zoomAnimation=false;
  }

  function bindUi(){
    ui.drawSurface.addEventListener('pointerdown',onDrawStart);ui.drawSurface.addEventListener('pointermove',onDrawMove);ui.drawSurface.addEventListener('pointerup',onDrawEnd);ui.drawSurface.addEventListener('pointercancel',cancelDrawing);ui.drawSurface.addEventListener('lostpointercapture',cancelDrawing);
    window.addEventListener('blur',()=>{cancelDrawing();});document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelDrawing();}});
    ui.zoomIn.addEventListener('click',()=>state.map.zoomIn());ui.zoomOut.addEventListener('click',()=>state.map.zoomOut());
    ui.clear.addEventListener('click',resetDrawing);ui.undo.addEventListener('click',undo);ui.submit.addEventListener('click',submitRoute);ui.next.addEventListener('click',newCall);ui.settingsButton.addEventListener('click',openSettings);ui.settingsClose.addEventListener('click',closeSettings);ui.retry.addEventListener('click',()=>location.reload());
    ui.serviceSelect.addEventListener('change',()=>{fillBases(ui.serviceSelect.value,null);ui.phaseNote.textContent=basesForService(ui.serviceSelect.value).map(b=>b.shortName||b.name).join(' → ')+' → previous call. Each base phase lasts 20 completed calls. CALL marks the nearest mapped public-road access to the address.';});
    for(const input of [ui.streetForgiveness,ui.straightPreference,ui.arrivalDistance,ui.challengeFrequency])input?.addEventListener('input',()=>displayTuning(draftTuning()));
    ui.settingsReset?.addEventListener('click',()=>displayTuning(DEFAULT_TUNING));
    ui.settingsForm.addEventListener('submit',event=>{event.preventDefault();const changed=applySettings(ui.serviceSelect.value,draftTuning());closeSettings();if(changed)newCall();});
    ui.settingsSheet.addEventListener('click',event=>{if(event.target===ui.settingsSheet)closeSettings();});
    ui.settingsSheet.addEventListener('close',()=>updateDrawTarget());
  }

  async function loadData(){
    if(!window.PTBO_DISPATCH_STORE)throw new Error('Shared dispatch store did not load.');
    const calls=await window.PTBO_DISPATCH_STORE.ready(),sharedCalls=Array.isArray(calls)?calls:window.PTBO_DISPATCH_STORE.getAll();
    if(!sharedCalls.length)throw new Error('The shared dispatch database is empty.');
    let geojson;
    if(window.PTBO_ROUTE_NETWORK_READY){const payload=await window.PTBO_ROUTE_NETWORK_READY;geojson=payload?.network||payload;}
    else{const response=await fetch(state.routeManifest?.networkUrl||CONFIG.roadUrl,{cache:'force-cache'});if(!response.ok)throw new Error('Selected city road data failed to load ('+response.status+').');geojson=await response.json();}
    if(!geojson?.features)throw new Error('The selected city road network is unavailable.');
    state.graph=await buildGraphAsync(geojson);
    state.traceCore=window.PTBO_ROUTE_TRACE.createTraceCore({graph:state.graph,toXY,toLatLng,cost:window.PTBO_ROUTE_COST,profile:responseProfile,search:(from,to,options)=>pathBetween(from,to,'distance',options)});
    state.originalCalls=sharedCalls;state.advancedCalls=[];state.calls=sharedCalls;
    // Versioned metadata provides the first three thoughtful choices at every base.
    // A legacy pack has no such metadata and retains the whole-city fallback.
    if(!state.routeManifest){buildDifficultyIndex();state.originalCalls=sharedCalls.map(scoreCall);state.advancedCalls=buildAdvancedCalls(state.originalCalls);state.calls=[...state.originalCalls,...state.advancedCalls];}
    if(state.routeManifest){state.networkInfo={cityId:state.cityId,graphVersion:state.graph.graphVersion,nodes:state.graph.nodes.length,segments:state.graph.segments.length};geojson.features=[];}
  }

  function showFailure(error){console.error(error);ui.app.setAttribute('aria-busy','false');ui.errorMessage.textContent=error&&error.message?error.message:String(error||'Unknown startup error');ui.error.hidden=false;setMode('loading');}

  async function initialize(){
    try{const label=document.getElementById('route-city-label');if(label)label.textContent=(SELECTED_CITY.name||'Peterborough')+' · '+VERSION;document.title='Route Mapping · '+(SELECTED_CITY.name||'Peterborough');initMap();bindUi();loadPreferences();await loadData();applyProgressionStart();if(!state.base)throw new Error('No starting base is available.');ui.app.setAttribute('aria-busy','false');newCall();window.PTBO_ROUTE_MAPPING=Object.freeze({version:VERSION,state,nearestRoad,composeRoute,pathBetween,referenceBetween,snapRoadAccess,responseProfile,analyzeDecisionDifficulty,newCall});}
    catch(error){showFailure(error);}
  }

  initialize();
})();
