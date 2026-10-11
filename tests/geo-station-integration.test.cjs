'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'geo-guesser/index.html'), 'utf8');
const practiceSource = fs.readFileSync(path.join(root, 'geo-guesser/station-practice.js'), 'utf8');
const lines = html.split(/\r?\n/);
function functionSource(name) {
  const line = lines.find(value => value.trimStart().startsWith(`function ${name}(`));
  assert.ok(line, `expected practice adapter function ${name}`);
  return line.trim();
}
function fixture({outcome='incorrect', center={lat:44.31,lng:-78.31}, zoom=16}={}) {
  const nodes = new Map(), removed = [], views = [], fitted = [];
  const node = id => {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, { id, textContent:'', innerHTML:'', value:'', classes,
        classList:{ add:value=>classes.add(value), remove:value=>classes.delete(value), contains:value=>classes.has(value) },
        focus(){this.focused=true} });
    }
    return nodes.get(id);
  };
  function layer(kind, latlng, options={}) {
    const entry={kind,latlng,latlngs:kind==='line'?latlng:null,options,tooltip:null,bindTooltip(value, opts){this.tooltip={value,opts};return this;},addTo(group){group.layers.push(this);return this;},getBounds(){return {points:[[latlng[0],latlng[1]]],extend(point){this.points.push(point);return this;}};}};
    return entry;
  }
  const map={
    center, zoom, removed,
    getCenter(){return this.center;}, getZoom(){return this.zoom;},
    fitBounds(bounds,opts){fitted.push({bounds,opts});}, stop(){return this;},
    setView(latlng,z,opts){views.push({latlng,z,opts});this.center={lat:latlng[0],lng:latlng[1]};this.zoom=z;return this;},
    removeLayer(item){removed.push(item);},
  };
  const context=vm.createContext({
    Math, Number, Object, Array, Map, Set,
    $:node, map, target:{name:'Call One',addr:'10 Example St',lat:44.3,lng:-78.3,radius:30},
    station:{name:'Station 1',lat:44.301,lng:-78.322}, practiceService:'fire',
    gameMode:'practice', practiceHistory:[], practiceReview:null, practiceReviewLayers:null, practiceRevealLayer:null,
    practiceSession:{state:{pending:false,revealed:false},stats:{completed:0,firstTry:0,assisted:0,misses:0,streak:0,bestStreak:0},
      guess(){this.guesses=(this.guesses||0)+1;if(outcome==='correct'){this.stats.completed++;this.stats.firstTry++;}else this.stats.misses++;return {accepted:true,correct:outcome==='correct',firstTry:true,stats:{...this.stats}};},
      reveal(){this.state.revealed=true;this.stats.completed++;this.stats.assisted++;return true;},continueRevealed(){this.state.revealed=false;this.continued=true;},finish(){this.finished=true;},cancel(){this.cancelled=true;}},
    meters:()=>50, practiceFeedback(message){node('practice-feedback').textContent=message;},
    practiceStatsText(stats){return `Completed ${stats.completed} · First try ${stats.firstTry} · Assisted ${stats.assisted} · Streak ${stats.streak}`;},
    applyCallTheme(){}, clearPracticeResultReview:undefined,
    L:{
      layerGroup(){return {layers:[],addTo(){return this;},clearLayers(){this.layers.length=0;}};},
      circle:(latlng,options)=>layer('circle',latlng,options),
      circleMarker:(latlng,options)=>layer('marker',latlng,options),
      polyline:(latlngs,options)=>layer('line',latlngs,options),
    },
    window:{innerWidth:390,innerHeight:844,matchMedia:()=>({matches:true})},
  });
  return {context,node,nodes,map,removed,views,fitted,layer};
}
function evaluate(f, names) { vm.runInContext(names.map(functionSource).join('\n'), f.context); }

test('practice result review draws labeled target and submitted guess, plus a measured miss line', () => {
  const f=fixture();
  evaluate(f,['clearPracticeResultReview','practiceReviewPadding','confirmPracticeGuess','showPracticeResultReview']);
  f.context.confirmPracticeGuess();
  const group=f.context.practiceReviewLayers;
  assert.ok(group);
  assert.equal(f.context.practiceReview.outcome,'incorrect');
  assert.equal(f.node('practice-review-title').textContent,'Incorrect');
  assert.match(f.node('practice-review-detail').textContent,/50\.0 m from target.*20\.0 m outside/i);
  assert.equal(group.layers[1].tooltip.value,'Actual location');
  assert.equal(group.layers[2].tooltip.value,'Your guess');
  assert.deepEqual(Array.from(group.layers,entry=>entry.kind),['circle','marker','marker','line']);
  assert.deepEqual(Array.from(group.layers[3].latlngs,point=>Array.from(point)),[[44.31,-78.31],[44.3,-78.3]]);
  assert.equal(group.layers[3].tooltip.value,'50.0 m');
  assert.equal(JSON.stringify(f.fitted.at(-1).bounds.points),JSON.stringify([[44.3,-78.3],[44.31,-78.31]]));
  assert.equal(f.node('reticle').classList.contains('hidden'),true);
  assert.equal(f.node('practice-reveal').classList.contains('hidden'),true);
  assert.equal(f.context.practiceSession.stats.assisted,0);
});

test('Try again clears review without another miss, preserves target, and restores submitted map view', () => {
  const f=fixture();
  evaluate(f,['clearPracticeResultReview','practiceReviewPadding','resumePracticeReview','confirmPracticeGuess','showPracticeResultReview']);
  const original=f.context.target;
  f.context.confirmPracticeGuess();
  const firstGroup=f.context.practiceReviewLayers;
  assert.equal(f.context.practiceSession.guesses,1);
  assert.equal(f.node('confirm').textContent,'TRY AGAIN');
  f.context.confirmPracticeGuess();
  assert.equal(f.context.practiceSession.guesses,1);
  assert.equal(f.context.practiceReview,null);
  assert.equal(f.context.practiceReviewLayers,null);
  assert.equal(f.context.target,original);
  assert.equal(f.context.practiceSession.stats.misses,1);
  assert.equal(JSON.stringify(f.views.at(-1).latlng),JSON.stringify([44.31,-78.31]));
  assert.equal(f.views.at(-1).z,16);
  assert.equal(f.node('reticle').classList.contains('hidden'),false);
  assert.equal(firstGroup.layers.length,0);
  assert.equal(f.removed.includes(firstGroup),true);
  assert.equal(f.node('confirm').textContent,'CHECK LOCATION · ENTER');
});

test('correct feedback shows both positions, keeps reticle hidden, and sets same-base reset delay', () => {
  const f=fixture({outcome:'correct',center:{lat:44.3001,lng:-78.3001}});
  evaluate(f,['clearPracticeResultReview','practiceReviewPadding','confirmPracticeGuess','showPracticeResultReview']);
  f.context.confirmPracticeGuess();
  assert.equal(f.context.practiceReview.outcome,'correct');
  assert.equal(f.node('practice-review-title').textContent,'Correct');
  assert.equal(f.context.practiceSession.stats.completed,1);
  assert.equal(f.context.practiceSession.stats.firstTry,1);
  assert.equal(f.context.practiceSession.stats.assisted,0);
  assert.deepEqual(Array.from(f.context.practiceReviewLayers.layers,entry=>entry.kind),['circle','marker','marker']);
  assert.equal(f.node('reticle').classList.contains('hidden'),true);
  assert.equal(f.node('confirm').classList.contains('hidden'),true);
  assert.match(html,/createSession\(\{locations:pool,onNext:loadPracticeTarget,delay:2500\}\)/);
  assert.match(functionSource('loadPracticeTarget'),/clearPracticeResultReview\(\)/);
  assert.match(functionSource('loadPracticeTarget'),/setView\(\[station\.lat,station\.lng\],18/);
});

test('result review cleanup removes layers on station return, finish and session cancellation', () => {
  const f=fixture();
  evaluate(f,['clearPracticeResultReview','practiceReviewPadding','showPracticeResultReview','returnToPracticeStation','cancelPracticeSession']);
  f.context.showPracticeResultReview('incorrect',{lat:44.31,lng:-78.31},50);
  const group=f.context.practiceReviewLayers;
  f.context.returnToPracticeStation();
  assert.equal(group.layers.length,0);
  assert.equal(f.removed.includes(group),true);
  assert.equal(f.node('practice-review').classList.contains('hidden'),true);
  assert.equal(f.node('practice-reveal').classList.contains('hidden'),false,'returning to the station restores the optional reveal control');
  assert.equal(JSON.stringify(f.views.at(-1).latlng),JSON.stringify([44.301,-78.322]));
  assert.match(functionSource('finishPractice'),/clearPracticeResultReview\(\)/);
  f.context.showPracticeResultReview('incorrect',{lat:44.31,lng:-78.31},50);
  const second=f.context.practiceReviewLayers;
  const session=f.context.practiceSession;
  f.context.cancelPracticeSession();
  assert.equal(second.layers.length,0);
  assert.equal(f.removed.includes(second),true);
  assert.equal(session.cancelled,true);
});

test('review map-fit padding clears measured header and check button on portrait and desktop layouts', () => {
  for (const viewport of [{width:390,height:844},{width:1280,height:720}]) {
    const f=fixture();
    const rect=(top,right,bottom,left)=>({top,right,bottom,left,width:right-left,height:bottom-top});
    f.map.getContainer=()=>({getBoundingClientRect:()=>rect(0,viewport.width,viewport.height,0)});
    f.node('header').getBoundingClientRect=()=>rect(67,viewport.width-11,165,11);
    f.node('confirm').getBoundingClientRect=()=>rect(viewport.height-66,viewport.width/2+90,viewport.height-18,viewport.width/2-90);
    f.node('practice-controls').getBoundingClientRect=()=>rect(0,0,0,0);
    f.node('practice-return').getBoundingClientRect=()=>rect(10,62,54,14);
    f.node('practice-finish').getBoundingClientRect=()=>rect(10,viewport.width-14,54,viewport.width-62);
    evaluate(f,['practiceReviewPadding']);
    const padding=f.context.practiceReviewPadding();
    assert.ok(padding.paddingTopLeft[1]>=210,`${viewport.width}x${viewport.height}: header label clearance`);
    assert.ok(padding.paddingBottomRight[1]>=111,`${viewport.width}x${viewport.height}: check button clearance`);
  }
});

test('compact result fitting preserves map width below the top corner buttons', () => {
  const f=fixture(),rect=(top,right,bottom,left)=>({top,right,bottom,left,width:right-left,height:bottom-top});
  f.map.getContainer=()=>({getBoundingClientRect:()=>rect(0,320,568,0)});
  f.node('header').getBoundingClientRect=()=>rect(58,268,208,52);
  f.node('confirm').getBoundingClientRect=()=>rect(503,234,551,86);
  f.node('practice-controls').getBoundingClientRect=()=>rect(0,0,0,0);
  f.node('practice-return').getBoundingClientRect=()=>rect(10,116,54,14);
  f.node('practice-finish').getBoundingClientRect=()=>rect(10,306,54,232);
  evaluate(f,['practiceReviewPadding']);
  const padding=f.context.practiceReviewPadding();
  assert.ok(320-padding.paddingTopLeft[0]-padding.paddingBottomRight[0]>=140,'retain room for distinct result endpoints and distance line');
  assert.ok(padding.paddingTopLeft[1]>=254,'target label clears the result card');
  assert.ok(padding.paddingBottomRight[1]>=111,'target label clears Try Again');
});

test('result fitting uses final button layout and refreshes map size before showing endpoints', () => {
  const f=fixture();let sizeRefreshed=false;
  f.map.invalidateSize=()=>{sizeRefreshed=true;};
  f.map.fitBounds=(bounds,options)=>{
    assert.equal(f.node('confirm').textContent,'TRY AGAIN');
    assert.equal(f.node('confirm').classList.contains('hidden'),false);
    assert.equal(sizeRefreshed,true);
    assert.equal(options.animate,false,'result endpoints appear immediately rather than racing another map animation');
  };
  f.node('confirm').textContent='CHECK LOCATION · ENTER';
  evaluate(f,['clearPracticeResultReview','practiceReviewPadding','showPracticeResultReview']);
  f.context.showPracticeResultReview('incorrect',[44.31,-78.31],50);
});

test('map framing waits for the result layout and ignores a canceled review', () => {
  const f=fixture(),frames=[];
  f.context.window.requestAnimationFrame=callback=>frames.push(callback);
  evaluate(f,['clearPracticeResultReview','practiceReviewPadding','showPracticeResultReview']);
  f.context.showPracticeResultReview('incorrect',[44.31,-78.31],50);
  assert.equal(f.fitted.length,0,'wait for the changed result layout');
  frames.shift()();assert.equal(f.fitted.length,1);
  f.context.showPracticeResultReview('incorrect',[44.31,-78.31],50);
  f.context.clearPracticeResultReview();
  frames.shift()();assert.equal(f.fitted.length,1,'leaving review cancels pending framing');
});

test('short-screen padding keeps a positive map area even during a layout change', () => {
  const f=fixture(),rect=(top,right,bottom,left)=>({top,right,bottom,left,width:right-left,height:bottom-top});
  f.map.getContainer=()=>({getBoundingClientRect:()=>rect(0,844,390,0)});
  f.node('header').getBoundingClientRect=()=>rect(8,665,219,177);
  f.node('confirm').getBoundingClientRect=()=>rect(306,495,354,348);
  evaluate(f,['practiceReviewPadding']);
  const padding=f.context.practiceReviewPadding();
  assert.ok(390-padding.paddingTopLeft[1]-padding.paddingBottomRight[1]>=95,'Leaflet must have positive height to calculate its fit zoom');
});
