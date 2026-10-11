"""Exercise the supplied standalone preview at the real King/Water junction.

python tests/route-junction-browser.py --preview /path/to/preview.html --output /tmp/junction-qa
Needs Python Playwright and Chromium. No online tiles are required.
Use --expect-spur only to reproduce the old preview's known error.
"""
import argparse, json, pathlib, shutil
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--preview',type=pathlib.Path,required=True)
parser.add_argument('--output',type=pathlib.Path,required=True)
parser.add_argument('--expect-spur',action='store_true')
parser.add_argument('--touch',action='store_true',help='Use Chromium mobile touch input')
parser.add_argument('--chromium',default=shutil.which('chromium'))
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
TOUCH=None
PREP=r'''()=>{
  const s=PTBO_ROUTE_MAPPING.state,g=s.graph,core=s.traceCore;
  const junction=g.nodes.find(n=>n.edges.some(e=>e.name==='Water Street')&&n.edges.some(e=>e.name==='King Street'));
  if(!junction)throw new Error('King/Water junction not found in this snapshot');
  const incoming=new Map();
  for(const node of g.nodes)for(const edge of node.edges){if(!incoming.has(edge.to))incoming.set(edge.to,[]);incoming.get(edge.to).push(edge);}
  // Test setup walks real directed road edges, not invented straight connectors.
  function walk(name,metres,backward=false,firstSegment=null){
    let node=junction,previous=-1,remaining=metres,points=[{lat:node.lat,lng:node.lng}];
    while(remaining>1e-6){
      const choices=(backward?incoming.get(node.id):node.edges)||[];
      const edge=choices.find(e=>e.name===name&&e.segmentId!==previous&&(firstSegment===null||e.segmentId===firstSegment));
      firstSegment=null;if(!edge)throw new Error('Cannot follow '+name);
      const next=g.nodes[backward?edge.from:edge.to],amount=Math.min(remaining,edge.distance),fraction=amount/edge.distance;
      const end={lat:node.lat+(next.lat-node.lat)*fraction,lng:node.lng+(next.lng-node.lng)*fraction};
      const count=Math.max(1,Math.ceil(amount/4));
      for(let i=1;i<=count;i++)points.push({lat:node.lat+(end.lat-node.lat)*i/count,lng:node.lng+(end.lng-node.lng)*i/count});
      previous=edge.segmentId;remaining-=amount;node=next;
    }
    return points;
  }
  const east=junction.edges.filter(e=>e.name==='King Street').sort((a,b)=>g.nodes[b.to].lng-g.nodes[a.to].lng)[0];
  const approach=walk('Water Street',80,true).reverse(),spur=walk('King Street',12,false,east.segmentId),continuation=walk('Water Street',60);
  const start=approach[0],end=continuation.at(-1),reference=core.between(core.snap(start,1),core.snap(end,1));
  s.base={...s.base,lat:start.lat,lng:start.lng,spawnLat:start.lat,spawnLng:start.lng};
  s.call={...s.call,lat:end.lat,lng:end.lng,addr:'King / Water — test call'};
  s.startMarker.setLatLng(start);s.callMarker.setLatLng(end);
  window.junctionFixture={approach,spur,continuation,start,end,reference};
  return {junction:{lat:junction.lat,lng:junction.lng},expected:reference.distance};
}'''

def position(page,latlng):
    return page.evaluate('p=>{const s=PTBO_ROUTE_MAPPING.state,q=s.map.latLngToContainerPoint(p),r=s.map.getContainer().getBoundingClientRect();return {x:q.x+r.left,y:q.y+r.top}}',latlng)

def begin(page):
    box=page.locator('#draw-surface').bounding_box();assert box,'START/END must remain usable'
    point={'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}
    if TOUCH:TOUCH.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point]})
    else:page.mouse.move(point['x'],point['y']);page.mouse.down()

def path(page,points):
    for point in points:
        xy=position(page,point)
        if TOUCH:TOUCH.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[xy]})
        else:page.mouse.move(xy['x'],xy['y'])
    page.wait_for_timeout(50)

def end(page):
    if TOUCH:TOUCH.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    else:page.mouse.up()

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390 if args.touch else 1000,'height':844 if args.touch else 820},is_mobile=args.touch,has_touch=args.touch);errors=[]
    if args.touch:TOUCH=page.context.new_cdp_session(page)
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('https://**/*',lambda route:route.abort())
    page.emulate_media(reduced_motion='reduce')
    page.set_content(args.preview.read_text())
    page.wait_for_function('Boolean(window.PTBO_ROUTE_MAPPING)',timeout=30000)
    result=page.evaluate(PREP)
    page.locator('#clear-button').click()
    page.evaluate('()=>{const s=PTBO_ROUTE_MAPPING.state,f=junctionFixture;s.map.fitBounds([f.start,f.end,...f.spur],{padding:[90,185],maxZoom:19,animate:false});document.querySelector("#call-address").textContent="King / Water — junction test";}')
    approach=page.evaluate('junctionFixture.approach');spur=page.evaluate('junctionFixture.spur');continuation=page.evaluate('junctionFixture.continuation')
    begin(page);path(page,approach[1:]);path(page,spur[1:]);end(page)
    result['paused_distance']=page.evaluate('PTBO_ROUTE_MAPPING.state.playerRoute.distance')
    assert 89<result['paused_distance']<95,result
    saved=page.evaluate('JSON.stringify(PTBO_ROUTE_MAPPING.state.playerRoute)')
    # Resume from the overshot endpoint and go north, without precisely tracing
    # back to the intersection. This is the missing junction-backtracking case.
    begin(page);path(page,continuation[6:]);end(page)
    assert page.evaluate('PTBO_ROUTE_MAPPING.state.playerRoute.complete')
    result['before_submit']=page.evaluate('''()=>{
      const s=PTBO_ROUTE_MAPPING.state,r=s.playerRoute;
      return {distance:r.distance,mainRoads:r.mainRoads,coordinates:r.coordinates,
        edgeDistance:r.edges.reduce((sum,e)=>sum+e.distance,0),
        drawnLines:s.playerLayers.map(layer=>layer.getLatLngs().map(p=>[p.lat,p.lng]))};
    }''')
    page.locator('#submit-button').click();assert page.locator('#results').is_visible()
    result['review']=page.evaluate('''()=>{
      const s=PTBO_ROUTE_MAPPING.state;
      return {player:s.playerRoute.distance,reference:s.shortestRoute.distance,
        efficiency:document.querySelector('#efficiency-value').textContent,
        extra:document.querySelector('#extra-distance').textContent,
        learning:PTBO_ROUTE_LEARNING.compareChoices(s.playerRoute,s.shortestRoute)};
    }''')
    result['version']=page.evaluate('PTBO_ROUTE_MAPPING.version');result['page_errors']=errors
    assert not errors,errors
    for line in result['before_submit']['drawnLines']:
        assert line==result['before_submit']['coordinates'],'Blue lines must render the canonical scored route'
    assert abs(result['before_submit']['edgeDistance']-result['before_submit']['distance'])<1e-6
    extra=result['review']['player']-result['review']['reference']
    if args.expect_spur:
        assert extra>15,result
    else:
        assert abs(extra)<.75,result
        assert result['review']['efficiency']=='100% efficient',result
        assert result['review']['extra']=='+0 m',result
        assert result['before_submit']['mainRoads']==['Water Street'],result
        assert not result['review']['learning']['regrets'],result
    page.screenshot(path=str(args.output/'king-water-review.png'))
    (args.output/'junction-results.json').write_text(json.dumps(result,indent=2))
    print(json.dumps({'version':result['version'],'input':'touch' if args.touch else 'mouse','efficiency':result['review']['efficiency'],'extra':result['review']['extra'],'page_errors':errors},indent=2))
    browser.close()
