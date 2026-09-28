(() => {
  'use strict';

  const VERSION = '1.6.90';
  const CONFIG = Object.freeze({
    roadUrl: '../city-explorer/data/osm-public-roads.geojson',
    centerLat: 44.3091,
    centerLng: -78.3197,
    gridSize: 120,
    roadSearchRadius: 130,
    destinationSearchRadius: 520,
    strokeAnchorSpacing: 150,
    strokeTolerance: 18,
    maxIntermediateAnchors: 12,
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
    callNumber:document.getElementById('call-number'), baseLabel:document.getElementById('base-label'), callType:document.getElementById('call-type'),
    callAddress:document.getElementById('call-address'), hint:document.getElementById('hint'), clear:document.getElementById('clear-button'),
    undo:document.getElementById('undo-button'), submit:document.getElementById('submit-button'), results:document.getElementById('results'),
    efficiency:document.getElementById('efficiency-value'), playerDistance:document.getElementById('player-distance'), shortestDistance:document.getElementById('shortest-distance'),
    extraDistance:document.getElementById('extra-distance'), resultNote:document.getElementById('result-note'), next:document.getElementById('next-button'),
    settingsButton:document.getElementById('settings-button'), settingsSheet:document.getElementById('settings-sheet'), settingsForm:document.getElementById('settings-form'),
    settingsClose:document.getElementById('settings-close'), serviceSelect:document.getElementById('service-select'), baseSelect:document.getElementById('base-select'),
    error:document.getElementById('loading-error'), errorMessage:document.getElementById('loading-error-message'), retry:document.getElementById('retry-button')
  };

  const state = {
    map:null, graph:null, calls:[], service:'fire', base:null, call:null, callCount:0, recentCallIds:[], mode:'loading',
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

  function pathBetween(startId,endId,objective){
    if(startId===endId)return {nodeIds:[startId],edges:[],distance:0,duration:0};
    const nodes=state.graph.nodes,target=nodes[endId],scores=new Float64Array(nodes.length),previous=new Int32Array(nodes.length),previousEdge=new Array(nodes.length),heap=new MinHeap();
    scores.fill(Infinity);previous.fill(-1);scores[startId]=0;heap.push({id:startId,score:heuristic(nodes[startId],target,objective)});let visited=0,found=false;
    while(heap.size&&visited<CONFIG.maxVisitedNodes){const cur=heap.pop();if(!cur)break;const expected=scores[cur.id]+heuristic(nodes[cur.id],target,objective);if(cur.score>expected+1e-7)continue;if(cur.id===endId){found=true;break;}visited+=1;for(const e of nodes[cur.id].edges){const next=scores[cur.id]+edgeCost(e,objective);if(next+1e-7>=scores[e.to])continue;scores[e.to]=next;previous[e.to]=cur.id;previousEdge[e.to]=e;heap.push({id:e.to,score:next+heuristic(nodes[e.to],target,objective)});}}
    if(!found)return null;const nodeIds=[],edges=[];let cursor=endId;while(cursor>=0){nodeIds.push(cursor);if(previousEdge[cursor])edges.push(previousEdge[cursor]);if(cursor===startId)break;cursor=previous[cursor];if(cursor<0)return null;}nodeIds.reverse();edges.reverse();return {nodeIds,edges,distance:edges.reduce((s,e)=>s+e.distance,0),duration:edges.reduce((s,e)=>s+e.duration,0)};
  }

  function summarizeRoads(edges){const out=[];for(const edge of edges){const name=edge.name==='Unnamed road'?edge.ref:edge.name;if(!name)continue;const last=out[out.length-1];if(last&&last.name===name)last.distance+=edge.distance;else out.push({name,distance:edge.distance});}return out.filter(r=>r.distance>=35).slice(0,8).map(r=>r.name);}

  function composeRoute(anchors,objective){
    if(!Array.isArray(anchors)||anchors.length<2)return null;const coordinates=[],coordinateLegIndex=[],edges=[];let distance=0,duration=0;
    for(let i=0;i<anchors.length-1;i+=1){const a=anchors[i],b=anchors[i+1],path=pathBetween(a.nodeId,b.nodeId,objective);if(!path)return {failedLeg:i};const legCoords=path.nodeIds.map(id=>[state.graph.nodes[id].lat,state.graph.nodes[id].lng]);if(!coordinates.length){coordinates.push([a.lat,a.lng]);coordinateLegIndex.push(i);}for(const c of legCoords){const last=coordinates[coordinates.length-1];if(last&&Math.abs(last[0]-c[0])<1e-10&&Math.abs(last[1]-c[1])<1e-10)continue;coordinates.push(c);coordinateLegIndex.push(i);}edges.push(...path.edges);distance+=path.distance;duration+=path.duration;}
    const firstNode=state.graph.nodes[anchors[0].nodeId],lastNode=state.graph.nodes[anchors[anchors.length-1].nodeId],firstConnector=dist(anchors[0],firstNode),lastConnector=dist(anchors[anchors.length-1],lastNode);
    distance+=Number.isFinite(firstConnector)?firstConnector:0;distance+=Number.isFinite(lastConnector)?lastConnector:0;duration+=(Number.isFinite(firstConnector)?firstConnector/12:0)+(Number.isFinite(lastConnector)?lastConnector/9:0);
    const end=anchors[anchors.length-1],last=coordinates[coordinates.length-1];if(!last||Math.abs(last[0]-end.lat)>1e-10||Math.abs(last[1]-end.lng)>1e-10){coordinates.push([end.lat,end.lng]);coordinateLegIndex.push(Math.max(0,anchors.length-2));}
    return {coordinates,coordinateLegIndex,edges,distance,duration,mainRoads:summarizeRoads(edges),objective};
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

  function mappedAnchorsFromStroke(points){
    const simplified=rdp(points,CONFIG.strokeTolerance),samples=resample(simplified,CONFIG.strokeAnchorSpacing),mapped=[];
    for(const p of samples){const road=nearestRoad(p.lat,p.lng,CONFIG.roadSearchRadius);if(!road)continue;const previous=mapped[mapped.length-1];if(previous&&previous.nodeId===road.nodeId)continue;if(previous&&dist(previous,road)<75&&previous.road===road.road)continue;mapped.push(road);}
    if(mapped.length<=CONFIG.maxIntermediateAnchors)return mapped;const reduced=[];for(let i=0;i<CONFIG.maxIntermediateAnchors;i+=1){const index=Math.round(i*(mapped.length-1)/(CONFIG.maxIntermediateAnchors-1));const item=mapped[index];if(!reduced.length||reduced[reduced.length-1].nodeId!==item.nodeId)reduced.push(item);}return reduced;
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
      let middle=mapped.filter(a=>a.nodeId!==origin.nodeId&&a.nodeId!==destination.nodeId);if(middle.length>CONFIG.maxIntermediateAnchors)middle=middle.slice(0,CONFIG.maxIntermediateAnchors);let anchors=[state.originAnchor,...middle,state.destinationAnchor];let route=composeRoute(anchors,'distance');
      while(route&&route.failedLeg!==undefined&&anchors.length>2){const removeIndex=Math.min(Math.max(1,route.failedLeg+1),anchors.length-2);anchors.splice(removeIndex,1);route=composeRoute(anchors,'distance');}
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
    clearLayer(state.interactiveLine);state.interactiveLine=null;renderReference();setMode('results');setHint('');
  }

  function callsForService(){const target=state.service==='ems'?'medical':'fire',filtered=state.calls.filter(c=>String(c.main||'').toLowerCase()===target);return filtered.length?filtered:state.calls;}
  function chooseCall(){
    const pool=callsForService(),recent=new Set(state.recentCallIds),fresh=pool.filter(c=>!recent.has(c.id)),source=fresh.length?fresh:pool;if(!source.length)throw new Error('No dispatch calls are available.');const call=source[Math.floor(Math.random()*source.length)];state.recentCallIds.push(call.id);while(state.recentCallIds.length>CONFIG.recentCalls)state.recentCallIds.shift();return call;
  }

  function newCall(){
    cancelEdit();clearRaw();clearReference();clearLayers(state.playerLayers);clearLayer(state.interactiveLine);state.interactiveLine=null;state.call=chooseCall();state.callCount+=1;state.playerRoute=null;state.shortestRoute=null;state.recommendedRoute=null;state.anchors=[];state.history=[];ui.callNumber.textContent='CALL '+state.callCount;ui.baseLabel.textContent=state.base.shortName||state.base.name;ui.callType.textContent=state.call.sub||state.call.main||'Dispatch Call';ui.callAddress.textContent=state.call.addr||state.call.name;updateMarkers();fitExercise();setMode('drawing');setHint('Draw a route from '+(state.base.shortName||state.base.name)+' to the call');
  }

  function basesForService(service){const store=window.PTBO_BASE_STORE;if(store&&typeof store.getBases==='function')return store.getBases(service);const profiles=window.PTBO_SERVICE_CONFIG&&window.PTBO_SERVICE_CONFIG.profiles;return profiles&&profiles[service]?profiles[service].bases||[]:[];}
  function fillBases(service,preferredId){const bases=basesForService(service);ui.baseSelect.innerHTML='';bases.forEach(base=>{const option=document.createElement('option');option.value=base.id;option.textContent=(base.shortName||base.name)+' · '+base.address;ui.baseSelect.appendChild(option);});const wanted=bases.find(b=>b.id===preferredId)||bases[0];if(wanted)ui.baseSelect.value=wanted.id;return wanted;}
  function loadPreferences(){let service='fire',baseId='station-1';try{service=localStorage.getItem('ptboRouteMappingService')||service;baseId=localStorage.getItem('ptboRouteMappingBase')||baseId;}catch(_){}if(!['fire','ems'].includes(service))service='fire';state.service=service;ui.serviceSelect.value=service;state.base=fillBases(service,baseId);}
  function savePreferences(){try{localStorage.setItem('ptboRouteMappingService',state.service);localStorage.setItem('ptboRouteMappingBase',state.base.id);}catch(_){}}
  function openSettings(){ui.serviceSelect.value=state.service;fillBases(state.service,state.base&&state.base.id);ui.settingsSheet.hidden=false;}
  function closeSettings(){ui.settingsSheet.hidden=true;}

  function initMap(){
    state.map=L.map('map',{zoomControl:false,attributionControl:true,preferCanvas:true,minZoom:11,maxZoom:19,worldCopyJump:false}).setView([CONFIG.centerLat,CONFIG.centerLng],13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,attribution:'&copy; OpenStreetMap contributors &copy; CARTO'}).addTo(state.map);
    L.control.zoom({position:'bottomright'}).addTo(state.map);state.map.doubleClickZoom.disable();
  }

  function bindUi(){
    ui.drawSurface.addEventListener('pointerdown',onDrawStart);ui.drawSurface.addEventListener('pointermove',onDrawMove);ui.drawSurface.addEventListener('pointerup',onDrawEnd);ui.drawSurface.addEventListener('pointercancel',onDrawEnd);
    ui.clear.addEventListener('click',resetDrawing);ui.undo.addEventListener('click',undo);ui.submit.addEventListener('click',submitRoute);ui.next.addEventListener('click',newCall);ui.settingsButton.addEventListener('click',openSettings);ui.settingsClose.addEventListener('click',closeSettings);ui.retry.addEventListener('click',()=>location.reload());
    ui.serviceSelect.addEventListener('change',()=>fillBases(ui.serviceSelect.value,null));
    ui.settingsForm.addEventListener('submit',event=>{event.preventDefault();const service=ui.serviceSelect.value,bases=basesForService(service),base=bases.find(b=>b.id===ui.baseSelect.value)||bases[0];if(!base)return;state.service=service;state.base=base;savePreferences();closeSettings();newCall();});
    ui.settingsSheet.addEventListener('click',event=>{if(event.target===ui.settingsSheet)closeSettings();});
  }

  async function loadData(){
    if(!window.PTBO_DISPATCH_STORE)throw new Error('Shared dispatch store did not load.');const calls=await window.PTBO_DISPATCH_STORE.ready();state.calls=Array.isArray(calls)?calls:window.PTBO_DISPATCH_STORE.getAll();if(!state.calls.length)throw new Error('The shared dispatch database is empty.');
    const response=await fetch(CONFIG.roadUrl,{cache:'force-cache'});if(!response.ok)throw new Error('Peterborough road data failed to load ('+response.status+').');const geojson=await response.json();state.graph=buildGraph(geojson);
  }

  function showFailure(error){console.error(error);ui.app.setAttribute('aria-busy','false');ui.errorMessage.textContent=error&&error.message?error.message:String(error||'Unknown startup error');ui.error.hidden=false;setMode('loading');}

  async function initialize(){
    try{initMap();bindUi();loadPreferences();await loadData();if(!state.base){const bases=basesForService(state.service);state.base=bases[0];}if(!state.base)throw new Error('No starting base is available.');ui.app.setAttribute('aria-busy','false');newCall();window.PTBO_ROUTE_MAPPING=Object.freeze({version:VERSION,state,nearestRoad,composeRoute,pathBetween,newCall});}
    catch(error){showFailure(error);}
  }

  initialize();
})();