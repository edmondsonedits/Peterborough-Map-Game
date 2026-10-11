"""Offline Chromium integration checks for Route Mapping.

Run: python tests/route-live-browser.py --repo-root . --output /tmp/route-qa
Requires the test-only Python Playwright package and a Chromium installation.
The actual game scripts and road data run in memory. External map tiles and the
hosting/bootstrap chain are deliberately outside the scope of this harness.
"""
import argparse, base64, gzip, json, pathlib, re, shutil
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo-root',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1])
parser.add_argument('--output',type=pathlib.Path,default=pathlib.Path('artifacts/route-live-qa'))
parser.add_argument('--chromium',default=shutil.which('chromium') or shutil.which('chromium-browser'))
args=parser.parse_args()
ROOT=args.repo_root.resolve();OUT=args.output.resolve();OUT.mkdir(parents=True,exist_ok=True)
# External basemap imagery is deliberately suppressed, not included in visual claims.
TRANSPARENT=bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082')
PREP='''() => {
 const {state:s}=window.PTBO_ROUTE_MAPPING,rect=s.map.getContainer().getBoundingClientRect(),surface=document.querySelector('#draw-surface');
 const origin=s.traceCore.snap(s.map.containerPointToLatLng(L.point(parseFloat(surface.style.left)-rect.left,parseFloat(surface.style.top)-rect.top)),3);
 const destination=s.traceCore.snap({lat:s.call.lat,lng:s.call.lng},520),reference=s.traceCore.between(origin,destination);
 if(!reference||reference.distance<240)throw new Error('Need a longer real road route for this check.');
 window.testRoute=reference;
 window.pointAtDistance=(wanted)=>{let distance=0;for(const edge of reference.edges){if(distance+edge.distance>=wanted){const t=(wanted-distance)/edge.distance;return {lat:edge.start.lat+(edge.end.lat-edge.start.lat)*t,lng:edge.start.lng+(edge.end.lng-edge.start.lng)*t};}distance+=edge.distance;}return reference.endpoint;};
 window.fitTest=()=>s.map.fitBounds([origin,pointAtDistance(180)],{padding:[70,160],maxZoom:17,animate:false});
 fitTest();return {distance:reference.distance,origin,street:reference.edges[0].name,nodes:s.graph.nodes.length,segments:s.graph.segments.length};
}'''
def ready(page):
    # In-memory loading is used because this environment blocks browser navigation,
    # including localhost. Gameplay code, Leaflet and road data remain unmodified.
    html=(ROOT/'route-mapping/index.html').read_text()
    html=re.sub(r'<script[^>]*src=[^>]+></script>','',html)
    html=re.sub(r'<link[^>]*rel="stylesheet"[^>]*>','',html)
    css=(ROOT/'response-simulator/vendor/leaflet-1.9.4/leaflet.css').read_text()+(ROOT/'route-mapping/styles.css').read_text()
    page.emulate_media(reduced_motion='reduce')
    page.set_content(html.replace('</head>','<style>'+css+'</style></head>'))
    page.evaluate("""()=>{Math.random = (() => {let x=123456;return ()=>{x=(1664525*x+1013904223)>>>0;return x/4294967296;};})();const saved=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k)}});window.PTBO_BUILD={version:'1.6.101'};}""")
    road=json.loads((ROOT/'city-explorer/data/osm-public-roads.geojson').read_text())
    payload=re.search(r"const PAYLOAD = '([^']+)'",(ROOT/'shared/dispatch-data-1.4.4.js').read_text()).group(1)
    calls=json.loads(gzip.decompress(base64.b64decode(payload)))
    page.evaluate("""({road,calls})=>{window.fetch=async url=>{if(String(url).includes('osm-public-roads.geojson'))return new Response(JSON.stringify(road),{status:200});throw new Error('Unexpected offline request: '+url);};window.PTBO_DISPATCH_STORE={ready:async()=>calls,getAll:()=>calls};}""",{'road':road,'calls':calls})
    for path in ['response-simulator/vendor/leaflet-1.9.4/leaflet.js','response-simulator/service-config.js','shared/location-changes.js','shared/base-locations.js','route-mapping/trace-core.js','route-mapping/learning-core.js']:
        page.add_script_tag(content=(ROOT/path).read_text())
    page.evaluate('url=>{L.TileLayer.prototype.getTileUrl=()=>url;}','data:image/png;base64,'+base64.b64encode(TRANSPARENT).decode())
    page.add_script_tag(content=(ROOT/'route-mapping/app.js').read_text())
    page.wait_for_function('Boolean(window.PTBO_ROUTE_MAPPING)',timeout=45000)
    return page.evaluate(PREP)
def distance(page):return page.evaluate('window.PTBO_ROUTE_MAPPING.state.playerRoute?.distance ?? 0')
def sample(page,d):return page.evaluate('d=>{const s=PTBO_ROUTE_MAPPING.state,p=s.map.latLngToContainerPoint(pointAtDistance(d)),r=s.map.getContainer().getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y};}',d)
def drag_start(page):
    page.locator('#draw-surface').wait_for(state='visible',timeout=5000)
    box=page.locator('#draw-surface').bounding_box();assert box,'END/START must be available'
    page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down()
def move(page,a,b,step=4):
    sign=1 if b>=a else -1
    values=list(range(round(a)+sign*step,round(b),sign*step))+[b]
    for d in values:
        p=sample(page,d);page.mouse.move(p['x'],p['y'])
    page.wait_for_timeout(45)
def near(value,target,tolerance=4):assert abs(value-target)<tolerance,(value,target)
def network_replay(page):
    report=page.evaluate('()=>{\n    const s=PTBO_ROUTE_MAPPING.state,core=s.traceCore,from=testRoute.start,reports=[],times=[];\n    for(const call of s.calls.slice(0,15)){\n      const to=core.snap({lat:Number(call.lat),lng:Number(call.lng)},520),reference=core.between(from,to);\n      if(!reference||reference.distance<60)continue;\n      const points=[from];\n      for(const edge of reference.edges){const steps=Math.max(1,Math.ceil(edge.distance/5));for(let i=1;i<=steps;i++)points.push({lat:edge.start.lat+(edge.end.lat-edge.start.lat)*i/steps,lng:edge.start.lng+(edge.end.lng-edge.start.lng)*i/steps});}\n      for(const tolerance of [12,30,60]){\n        let route=core.begin(from),previous=from,blocked=0;\n        for(const point of points.slice(1)){const start=performance.now(),result=core.advance(route,point,{tolerance,previousPoint:previous});times.push(performance.now()-start);route=result.route;previous=point;blocked+=result.blocked?1:0;}\n        const preReleaseEndpointGap=core.distance(route.endpoint,reference.endpoint);\n        // Match the UI lifecycle: release resolves calls inside the junction deadband.\n        route=core.finish(route,reference.endpoint,40);\n        const forward=route.distance,forwardGap=core.distance(route.endpoint,reference.endpoint);\n        for(const point of points.slice(0,-1).reverse()){const result=core.advance(route,point,{tolerance,previousPoint:previous});route=result.route;previous=point;blocked+=result.blocked?1:0;}\n        reports.push({call:call.addr||call.name,tolerance,expected:reference.distance,forward,forwardGap,preReleaseEndpointGap,remaining:route.distance,blocked});\n      }\n    }\n    times.sort((a,b)=>a-b);return {routes:reports,samples:times.length,medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],maxMs:times.at(-1)};\n  }')
    assert len(report['routes'])==45, 'Expected 15 road routes at three tolerances'
    for case in report['routes']:
        assert case['blocked']==0, case
        assert abs(case['forward']-case['expected'])<.4, case
        assert case['forwardGap']<.4, case
        assert case['remaining']<.35, case
    return report

result={}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1100,'height':820})
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    result['real_network']=ready(page)
    result['network_replay']=network_replay(page)
    box=page.locator('#draw-surface').bounding_box()
    page.mouse.click(box['x']+box['width']/2+8,box['y']+box['height']/2)
    assert distance(page)==0,'An off-centre click without dragging must not create a route'
    assert page.evaluate('PTBO_ROUTE_MAPPING.state.history.length')==0
    result['off_center_click_is_noop']=True
    drag_start(page);move(page,0,120)
    live=distance(page);assert live>100, f'Route should already be snapped before release; observed {live} m'
    result['live_before_release_m']=live
    move(page,120,60);near(distance(page),60);result['reverse_before_release_m']=distance(page)
    page.mouse.up();near(distance(page),60);saved=page.evaluate('JSON.stringify(PTBO_ROUTE_MAPPING.state.playerRoute.coordinates)')
    page.wait_for_timeout(100);assert page.evaluate('JSON.stringify(PTBO_ROUTE_MAPPING.state.playerRoute.coordinates)')==saved
    result['release_preserves_geometry']=True
    page.locator('#settings-button').click();assert page.locator('#draw-surface').is_hidden()
    page.locator('#settings-close').click();assert page.evaluate('JSON.stringify(PTBO_ROUTE_MAPPING.state.playerRoute.coordinates)')==saved
    result['settings_preserve_paused_route']=True
    page.mouse.move(1000,480);page.mouse.down();page.mouse.move(940,510,steps=6);page.mouse.up()
    assert page.evaluate('JSON.stringify(PTBO_ROUTE_MAPPING.state.playerRoute.coordinates)')==saved
    before_zoom=page.evaluate('PTBO_ROUTE_MAPPING.state.map.getZoom()')
    page.locator('#zoom-in').click();page.wait_for_function('zoom=>PTBO_ROUTE_MAPPING.state.map.getZoom()===zoom+1 && !PTBO_ROUTE_MAPPING.state.mapZooming && !PTBO_ROUTE_MAPPING.state.map._animatingZoom',arg=before_zoom)
    assert page.evaluate('JSON.stringify(PTBO_ROUTE_MAPPING.state.playerRoute.coordinates)')==saved
    result['pan_and_zoom_preserve_geometry']=True
    page.evaluate('fitTest()');drag_start(page);move(page,60,160);near(distance(page),160);page.mouse.up()
    result['resume_from_endpoint_m']=distance(page)
    page.locator('#undo-button').click();near(distance(page),60);page.locator('#undo-button').click();near(distance(page),0)
    result['undo_restores_whole_strokes']=True
    page.evaluate('fitTest()');drag_start(page);move(page,0,70)
    page.evaluate("document.querySelector('#draw-surface').dispatchEvent(new PointerEvent('pointercancel',{pointerId:PTBO_ROUTE_MAPPING.state.drawingPointer,bubbles:true}))")
    page.mouse.up();near(distance(page),70)
    assert page.evaluate('PTBO_ROUTE_MAPPING.state.drawingPointer===null && PTBO_ROUTE_MAPPING.state.map.dragging.enabled()')
    result['cancellation_preserves_valid_route']=True
    assert page.evaluate('!PTBO_ROUTE_MAPPING.state.map.doubleClickZoom.enabled()')
    result['gesture_configuration_restored']=True
    page.locator('#clear-button').click();near(distance(page),0)
    # Set a nearby call using the existing real street geometry; data files are not modified.
    page.evaluate('''()=>{const s=PTBO_ROUTE_MAPPING.state,end=pointAtDistance(180);s.call={...s.call,lat:end.lat,lng:end.lng};s.callMarker.setLatLng(end);fitTest();}''')
    drag_start(page);move(page,0,165);page.mouse.up()
    assert page.evaluate('PTBO_ROUTE_MAPPING.state.playerRoute?.complete===true'),page.locator('#hint').inner_text()
    assert page.locator('#submit-button').is_enabled();page.locator('#submit-button').click()
    assert page.locator('#results').is_visible()
    result['arrival_and_submission']=True
    page.locator('#next-button').click();assert distance(page)==0
    result['next_call_clears_route']=True
    # Test-only road backdrop makes the offline geometry legible in the evidence screenshot.
    page.evaluate('''()=>{const s=PTBO_ROUTE_MAPPING.state;L.geoJSON({type:'FeatureCollection',features:s.graph.segments.map(e=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[s.graph.nodes[e.from].lng,s.graph.nodes[e.from].lat],[s.graph.nodes[e.to].lng,s.graph.nodes[e.to].lat]]}}))},{style:{color:'#b8c4ce',weight:2,opacity:.6},interactive:false}).addTo(s.map);}''')
    ready_info=page.evaluate(PREP);drag_start(page);move(page,0,120);page.mouse.up()
    page.screenshot(path=str(OUT/'desktop-route.png'))
    page.locator('#settings-button').click();page.locator('#service-select').select_option('ems');page.locator('#settings-form button[type=submit]').click()
    assert page.evaluate("PTBO_ROUTE_MAPPING.state.service==='ems'");page.evaluate(PREP)
    drag_start(page);move(page,0,80);page.mouse.up();near(distance(page),80)
    result['ems_live_drawing']=True
    result['page_errors']=errors;assert not errors,errors
    context.close()
    # A real Chromium touch-input stream exercises touch-action and pointer capture.
    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
    page=mobile.new_page();mobile_errors=[];page.on('pageerror',lambda e:mobile_errors.append(str(e)))
    ready(page);cdp=mobile.new_cdp_session(page)
    box=page.locator('#draw-surface').bounding_box();start={'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[start]})
    for d in range(4,101,4):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[sample(page,d)]})
    page.wait_for_timeout(60);near(distance(page),100);result['touch_live_m']=distance(page)
    for d in range(96,39,-4):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[sample(page,d)]})
    page.wait_for_timeout(60);near(distance(page),40)
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});near(distance(page),40)
    result['touch_reverse_and_release_m']=distance(page)
    box=page.locator('#draw-surface').bounding_box();start={'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[start]})
    for d in range(44,121,4):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[sample(page,d)]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});near(distance(page),120)
    result['touch_resume_m']=distance(page);result['mobile_page_errors']=mobile_errors;assert not mobile_errors,mobile_errors
    page.screenshot(path=str(OUT/'mobile-route.png'));mobile.close();browser.close()
print(json.dumps({**result,'network_replay':{'cases':len(result['network_replay']['routes']),'samples':result['network_replay']['samples'],'p95Ms':result['network_replay']['p95Ms']}},indent=2));(OUT/'browser-results.json').write_text(json.dumps(result,indent=2))
