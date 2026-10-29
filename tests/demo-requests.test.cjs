'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tracker = read('shared/site-analytics-1.6.25.js');
const privacy = read('shared/analytics-privacy-upgrade-1.6.33.js');
const registry = read('cities/city-registry.js');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { get length(){return values.size;}, key:index=>[...values.keys()][index]??null, getItem:key => values.get(key) ?? null, setItem:(key, value) => values.set(key, String(value)), removeItem:key => values.delete(key) };
}

// Run the complete shipped clients, with only browser/network boundaries replaced.
async function client({ policy = true, local = storage(), session = storage(), pathname = '/test/', search = '', deployment, collections = {} } = {}) {
  const requests = [], replies = [], listeners = [], intervals = new Map();
  let timer = 0, id = 0;
  class Element {
    constructor(dataset = {}) { this.dataset = dataset; }
    closest(selector) { return selector === '[data-analytics-target]' && this.dataset.analyticsTarget ? this : null; }
  }
  const encode = record => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, typeof value === 'number' ? { integerValue:String(value) } : { stringValue:String(value) }]));
  const context = vm.createContext({
    console, URL, URLSearchParams, AbortController, Element,
    localStorage:local, sessionStorage:session,
    location:{ pathname, search }, navigator:{ userAgent:'Chrome/1', maxTouchPoints:0 }, screen:{ width:1280, height:900 }, innerWidth:1280, innerHeight:900,
    crypto:{ randomUUID:() => `fixture-${++id}` }, performance:{ now:() => 0 },
    document:{ visibilityState:'visible', documentElement:{ dataset:{} }, getElementById:() => null, addEventListener:(name, fn, capture) => listeners.push({ name, fn, capture }) },
    addEventListener() {}, setTimeout:() => ++timer, clearTimeout() {},
    setInterval(fn) { const value = ++timer; intervals.set(value, fn); return value; }, clearInterval(value) { intervals.delete(value); },
    PTBO_DEPLOYMENT:deployment,
    fetch:async (url, options = {}) => {
      const collection = new URL(url).pathname.split('/documents/')[1].split('/')[0];
      const request = { url, options, collection, record:options.body ? JSON.parse(options.body).fields : undefined };
      requests.push(request);
      if (!options.body) return { ok:true, status:200, json:async () => ({ documents:(collections[collection] || []).map((record, i) => ({ name:`${collection}/${record.id || i}`, fields:encode(record) })) }) };
      const result = replies.shift() ?? 200;
      if (result === 'network') throw new Error('Network unavailable');
      if (result && typeof result.then === 'function') await result;
      const status = typeof result === 'number' ? result : 200;
      return { ok:status >= 200 && status < 300, status, json:async () => ({ error:{ message:'Fixture denied' } }) };
    },
  });
  context.window = context; context.top = context;
  vm.runInContext(registry, context);
  if (policy) vm.runInContext(privacy, context);
  vm.runInContext(tracker, context);
  await context.PTBO_ANALYTICS_READY;
  if (policy) {
    const waitForBase = [...intervals.values()][0];
    waitForBase();
    await new Promise(resolve => setImmediate(resolve));
  }
  requests.length = 0;
  return { context, api:context.PTBO_SITE_ANALYTICS, requests, replies, local, session, listeners, Element };
}

const fields = request => Object.fromEntries(Object.entries(request.record).map(([key, value]) => [key, value.stringValue ?? Number(value.integerValue)]));

test('production privacy-wrapped API sends only the requested city/mode after explicit submission', async () => {
  const h = await client();
  assert.equal(typeof h.api.recordDemoRequest, 'function');
  assert.equal(h.requests.length, 0);
  assert.equal(await h.api.recordDemoRequest('toronto', 'dispatch'), true);
  assert.equal(h.requests.length, 1);
  const request = h.requests[0], record = fields(request);
  assert.equal(request.collection, 'siteAnalytics');
  assert.equal(request.options.method, 'PATCH');
  assert.equal(record.recordType, 'demo_request');
  assert.equal(record.city, 'toronto');
  assert.equal(record.mode, 'dispatch');
  assert.ok(record.eventId && record.sessionId);
  assert.deepEqual(Object.keys(record).sort(), ['build', 'city', 'createdAt', 'eventId', 'mode', 'recordType', 'sessionId', 'surface']);
});

test('double submission and reloaded pages count once per session/city/mode', async () => {
  const session = storage(), h = await client({ session });
  let release;
  h.replies.push(new Promise(resolve => { release = resolve; }));
  const first = h.api.recordDemoRequest('toronto', 'route');
  const duplicate = h.api.recordDemoRequest('toronto', 'route');
  release();
  assert.deepEqual(await Promise.all([first, duplicate]), [true, true]);
  assert.equal(h.requests.length, 1);
  assert.equal(await h.api.recordDemoRequest('toronto', 'route'), true);
  assert.equal(h.requests.length, 1);
  const reloaded = await client({ session });
  assert.equal(await reloaded.api.recordDemoRequest('toronto', 'route'), true);
  assert.equal(reloaded.requests.length, 0);
  assert.equal(await reloaded.api.recordDemoRequest('toronto', 'explorer'), true);
  assert.equal(await reloaded.api.recordDemoRequest('belleville', 'route'), true);
  assert.equal(reloaded.requests.length, 2);
});

for (const failure of [500, 'network']) test(`failed ${failure} writes return false and retry the same document/event ID`, async () => {
  const h = await client();
  h.replies.push(failure, 200);
  assert.equal(await h.api.recordDemoRequest('scarborough', 'geo'), false);
  assert.equal(await h.api.recordDemoRequest('scarborough', 'geo'), true);
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].url, h.requests[1].url);
  assert.equal(fields(h.requests[0]).eventId, fields(h.requests[1]).eventId);
  assert.ok(h.requests.every(request => request.collection === 'siteAnalytics'));
});

test('permanent denial never reports a local-only success or writes into scores', async () => {
  const h = await client();
  h.replies.push(403);
  assert.equal(await h.api.recordDemoRequest('toronto', 'dispatch'), false);
  assert.equal(await h.api.recordDemoRequest('toronto', 'dispatch'), false);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].collection, 'siteAnalytics');
});

test('invalid cities and modes are rejected before transport', async () => {
  const h = await client();
  for (const [city, mode] of [['toronto', 'email'], ['toronto', ''], ['bogus-city', 'geo'], ['Toronto', 'geo'], ['../toronto', 'geo'], ['toronto\nemail@example.com', 'geo']]) {
    assert.equal(await h.api.recordDemoRequest(city, mode), false, `${city}/${mode}`);
  }
  assert.equal(h.requests.length, 0);
});

test('owner/stats/privacy exclusions also apply to demo requests and always return a promise', async () => {
  for (const settings of [
    { local:storage({ 'ptbo-emergency-developer-mode':'enabled' }) },
    { local:storage({ 'ptbo-emergency-stats-mode':'enabled' }) },
    { pathname:'/site-stats/' }, { search:'?analytics=off' },
    { deployment:{ mode:'department', analyticsEnabled:false } },
  ]) {
    const h = await client(settings);
    const result = h.api.recordDemoRequest('toronto', 'dispatch');
    assert.equal(typeof result.then, 'function');
    assert.equal(await result, false);
    assert.equal(h.requests.length, 0);
  }
});

test('prevented unavailable launches are ignored by delegated click analytics', async () => {
  const h = await client();
  const delegated = h.listeners.filter(listener => listener.name === 'click');
  assert.ok(delegated.length);
  // A target handler has already cancelled the unavailable link before bubbling.
  for (const listener of delegated) listener.fn({ isTrusted:true, defaultPrevented:true, target:new h.Element({ analyticsTarget:'dispatch' }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests.length, 0);
  assert.equal(delegated[0].capture, undefined, 'delegation runs after target handlers can prevent the click');
});

test('aggregate demand deduplicates cross-collection retries and semantic session duplicates', async () => {
  const request = (id, city, mode, sessionId = id) => ({ id, eventId:id, recordType:'demo_request', city, mode, sessionId, build:'1.6.25', createdAt:'2026-10-15T00:00:00Z' });
  const h = await client({ policy:false, collections:{
    siteAnalytics:[request('one', 'toronto', 'dispatch', 'same-session'), request('two', 'toronto', 'route'), request('three', 'belleville', 'geo'), request('bad-mode', 'toronto', 'email'), request('bad-city', '../oops', 'geo'), { id:'score', score:100 }, { id:'summary', recordType:'session_summary', sessionId:'legacy', activeSeconds:4, launch_dispatch:2 }],
    scores:[request('one', 'toronto', 'dispatch', 'same-session'), request('retry-id', 'toronto', 'dispatch', 'same-session'), { id:'legacy-launch', recordType:'launch', eventId:'launch', target:'dispatch', build:'1.6.20' }],
  } });
  const stats = await h.api.loadStats();
  assert.deepEqual(JSON.parse(JSON.stringify(stats.demoRequests)), {
    total:3, byCity:{ toronto:2, belleville:1 }, byMode:{ dispatch:1, route:1, geo:1 }, byCityMode:{ toronto:{ dispatch:1, route:1 }, belleville:{ geo:1 } },
  });
  assert.equal(stats.activeSeconds, 4);
  assert.equal(stats.launches.dispatch, 3);
  assert.equal(stats.recordCount, 9, 'existing source count semantics include duplicate source rows and exclude unrelated score documents');
});

function statsPage(api, local = storage()) {
  const elements = new Map();
  class Node {
    constructor() { this.children = []; this.textContent = ''; this.hidden = false; this.classList = { add() {}, remove() {} }; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this.children = children; }
    addEventListener(name, fn) { this[name] = fn; }
    setAttribute() {}
  }
  const context = vm.createContext({ console, localStorage:local, sessionStorage:storage(), document:{ getElementById:id => { if (!elements.has(id)) elements.set(id, new Node()); return elements.get(id); }, createElement:() => new Node() }, PTBO_SECURE_ANALYTICS:api });
  context.window = context;
  vm.runInContext(read('shared/demo-requests.js'), context);
  const script = read('site-stats/index.html').match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script, context);
  return { elements, text:node => [node.textContent, ...node.children.map(child => [child.textContent, ...child.children.map(cell => cell.textContent)].join(' '))].join(' ') };
}

test('Website Stats stays locked without an authenticated admin integration', async () => {
  let called = false;
  const h = statsPage({ authorized:false, loadStats:async () => { called = true; return {}; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(called, false);
  assert.match(h.elements.get('status').textContent, /locked/);
});


function adapter({feedback,ready,local=storage(),session=storage()}={}){
 const context=vm.createContext({console,localStorage:local,sessionStorage:session,PTBO_FEEDBACK:feedback,PTBO_FEEDBACK_READY:ready});context.window=context;vm.runInContext(registry,context);vm.runInContext(read('shared/demo-requests.js'),context);return{api:context.PTBO_DEMO_REQUESTS,context};
}
test('retiring the device counter removes its aggregate and markers, preserves unrelated storage and does not send old requests',()=>{
 const local=storage({'ptbo-demo-requests-v1':'{"byCityMode":{"oshawa":{"route":1}}}','keep':'yes'}),session=storage({'ptbo-demo-request-session-v1':'old','ptbo-device-demo-request-v1:old:oshawa:route':'local','ptbo-site-session-id-v3':'keep'});
 let calls=0;adapter({local,session,feedback:{requestDemo(){calls++;}}});assert.equal(local.getItem('ptbo-demo-requests-v1'),null);assert.equal(session.getItem('ptbo-device-demo-request-v1:old:oshawa:route'),null);assert.equal(local.getItem('keep'),'yes');assert.equal(session.getItem('ptbo-site-session-id-v3'),'keep');assert.equal(calls,0);
});
test('adapter routes explicit requests only into acknowledged private feedback and passes the city name',async()=>{
 let received=false,payload,opened;const feedback={async requestDemo(input){payload=input;received=true;return{id:'private-thread'};},demoRequestStatus:()=>({remoteSaved:received}),async openDemoConversation(...args){opened=args;}};
 const h=adapter({feedback});h.context.PTBO_SITE_ANALYTICS={recordDemoRequest(){throw Error('must not use analytics');}};
 assert.equal(await h.api.recordDemoRequest('oshawa','route'),true);assert.deepEqual(JSON.parse(JSON.stringify(payload)),{city:'oshawa',cityName:'Oshawa',mode:'route'});assert.equal(h.api.requestStatus('oshawa','route').remoteSaved,true);await h.api.openConversation('oshawa','route');assert.deepEqual(opened,['oshawa','route']);
});
test('adapter waits for feedback initialization and unavailable/invalid requests cannot report success',async()=>{
 let finish,calls=0;const h=adapter({ready:new Promise(r=>finish=r)}),pending=h.api.recordDemoRequest('oshawa','route');await new Promise(r=>setImmediate(r));assert.equal(calls,0);finish({async requestDemo(){calls++;return{id:'ok'};}});assert.equal(await pending,true);
 assert.equal(await adapter().api.recordDemoRequest('oshawa','route'),false);for(const [city,mode] of [['constructor','geo'],['unknown','geo'],['oshawa','invalid']])assert.equal(await h.api.recordDemoRequest(city,mode),false);assert.equal(calls,1);
});
test('adapter preserves full-version intent for sending, acknowledged status and opening the private thread',async()=>{
 let payload,statusArgs,openArgs;
 const h=adapter({feedback:{async requestDemo(input){payload=input;return{id:'full'};},demoRequestStatus(...args){statusArgs=args;return{remoteSaved:true};},async openDemoConversation(...args){openArgs=args;}}});
 assert.equal(await h.api.recordDemoRequest('richmond-hill','dispatch','full-version'),true);
 assert.deepEqual(JSON.parse(JSON.stringify(payload)),{city:'richmond-hill',cityName:'Richmond Hill',mode:'dispatch',requestType:'full-version'});
 assert.equal(h.api.requestStatus('richmond-hill','dispatch','full-version').remoteSaved,true);
 assert.deepEqual(statusArgs,['richmond-hill','dispatch','full-version']);
 await h.api.openConversation('richmond-hill','dispatch','full-version');
 assert.deepEqual(openArgs,['richmond-hill','dispatch','full-version']);
 assert.equal(await h.api.recordDemoRequest('richmond-hill','dispatch','purchase'),false);
});
test('retired demo demand no longer appears in Website Stats; all feedback shares one inbox link',()=>{
 const html=read('site-stats/index.html');assert.doesNotMatch(html,/local-demo-request-rows|demo-requests-total|Demo requests on this device|Shared demo demand/);assert.match(html,/href="\.\.\/feedback\/"/);
});
