from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 exact match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 regex match, found {count}")
    return updated


def patch_geo(path: Path) -> None:
    text = path.read_text(encoding="utf-8")

    enhancement_css = r'''
    /* Compact mobile dispatch, persistent answer review, and safe attribution. */
    .leaflet-control-attribution, .leaflet-control-attribution a { pointer-events:none!important; user-select:none; color:inherit; text-decoration:none }
    .result-label { background:#161620; color:#f8fafc; border:1px solid rgba(255,255,255,.2); box-shadow:0 3px 10px #0007; font-weight:750 }
    .result-label:before { border-top-color:#161620 }
    #feedback { top:auto; bottom:calc(22px + env(safe-area-inset-bottom)); width:min(90%,380px); padding:13px 16px; text-align:left }
    #feedback p { margin:4px 0 }
    #next-call { width:100%; margin-top:10px; padding:12px 16px; border:0; border-radius:9px; background:var(--blue); color:#fff; font-weight:850; letter-spacing:.55px }
    #dispatch-card { inset:auto auto calc(22px + env(safe-area-inset-bottom)) 50%; transform:translateX(-50%); width:min(calc(100% - 28px),560px); padding:13px 14px; text-align:left; display:grid; grid-template-columns:42px minmax(0,1fr) 108px; grid-template-rows:auto auto auto auto; column-gap:11px; row-gap:1px; align-items:center }
    #dispatch-icon { grid-column:1; grid-row:1 / span 4; width:38px; height:38px; margin:0; font-size:1.2rem }
    #dispatch-type { grid-column:2; grid-row:1; font-size:.68rem }
    #dispatch-name { grid-column:2; grid-row:2; margin:1px 0; min-width:0; font-size:1.02rem; line-height:1.2 }
    #dispatch-address { grid-column:2; grid-row:3; min-width:0; font-size:.82rem; line-height:1.25 }
    #dispatch-meta { grid-column:2; grid-row:4; margin:4px 0 0; padding:0; border:0; font-size:.66rem }
    #dispatch-start { grid-column:3; grid-row:1 / span 4; width:100%; min-height:48px; padding:10px 8px }
    @media (max-width:600px) {
      #feedback { top:auto; bottom:calc(12px + env(safe-area-inset-bottom)); width:calc(100% - 20px); padding:12px 14px }
      #dispatch-card { bottom:calc(12px + env(safe-area-inset-bottom)); width:calc(100% - 20px); grid-template-columns:minmax(0,1fr) 84px; padding:11px 12px; column-gap:9px }
      #dispatch-icon { display:none }
      #dispatch-type, #dispatch-name, #dispatch-address, #dispatch-meta { grid-column:1 }
      #dispatch-start { grid-column:2; grid-row:1 / span 4; min-height:52px; font-size:.78rem }
    }
'''
    text = replace_once(text, "  </style>", enhancement_css + "  </style>", "geo enhancement CSS")

    old_feedback = '<div id="feedback" class="panel hidden"><strong id="miss"></strong><p id="penalty"></p><p id="feedback-detail"></p></div>'
    new_feedback = '<div id="feedback" class="panel hidden"><strong id="miss"></strong><p id="penalty"></p><p id="feedback-detail"></p><button id="next-call" onclick="continueAfterReview()">NEXT CALL</button></div>'
    text = replace_once(text, old_feedback, new_feedback, "geo feedback button")

    old_vars = "let map, editorMap, editorMarkers=[], station, targets=[], index=0, target, elapsed=0, interval, history=[], processing=false, editIndex=-1, preview, gameMode='random', sessionEnded=false;"
    new_vars = "let map, editorMap, editorMarkers=[], station, targets=[], index=0, target, elapsed=0, interval, history=[], processing=false, editIndex=-1, preview, reviewLayers=null, gameMode='random', sessionEnded=false;"
    text = replace_once(text, old_vars, new_vars, "geo review layer variable")

    text = replace_once(
        text,
        "history=[];processing=false;sessionEnded=false;$('end-drill')",
        "history=[];processing=false;sessionEnded=false;clearReviewLayers();$('feedback').classList.add('hidden');$('end-drill')",
        "geo start review cleanup",
    )

    text = replace_once(
        text,
        "if(!map){map=L.map('map',{zoomControl:false});",
        "if(!map){map=L.map('map',{zoomControl:false});map.attributionControl.setPrefix(false);",
        "geo disable Leaflet redirect",
    )

    review_functions = r'''function clearReviewLayers(){if(reviewLayers){reviewLayers.clearLayers();map.removeLayer(reviewLayers);reviewLayers=null}}
    function continueAfterReview(){if(!processing)return;clearReviewLayers();$('feedback').classList.add('hidden');index++;if(gameMode==='open'){const pool=locations.filter(loc=>enabledCallTypes().includes(loc.sub));const next=chooseCalls(stations.indexOf(station),1,pool)[0];if(next)targets.push(next)}if(index<targets.length){processing=false;prepareDispatch()}else endGame()}
    function confirmGuess(){if(processing)return;processing=true;clearInterval(interval);const g=map.getCenter(),m=meters(g.lat,g.lng,target.lat,target.lng),ft=Math.round(m*3.28084),radiusFt=Math.round(target.radius*3.28084),outsideFt=Math.max(0,ft-radiusFt),p=gameMode==='open'?0:Math.min(60,outsideFt/10);elapsed+=p;history.push({name:target.name,addr:target.addr,ft,radiusFt,outsideFt,penalty:p.toFixed(1)});$('miss').textContent=outsideFt===0?'Inside target radius!':`Outside target by: ${Math.round(outsideFt)} ft`;$('penalty').textContent=gameMode==='open'?'Practice feedback — no time penalty':`Penalty: +${p.toFixed(1)}s`;$('feedback-detail').textContent=`Your guess was ${ft} ft from the target. Target radius: ${radiusFt} ft.`;$('next-call').textContent=gameMode==='open'||index<targets.length-1?'NEXT CALL':'VIEW RESULTS';$('feedback').classList.remove('hidden');$('confirm').classList.add('hidden');$('reticle').classList.add('hidden');reviewLayers=L.layerGroup().addTo(map);const targetPoint=[target.lat,target.lng];L.polyline([g,targetPoint],{color:'#f8fafc',weight:4,opacity:.92,dashArray:'10 8'}).addTo(reviewLayers);const targetCircle=L.circle(targetPoint,{radius:target.radius,color:'#22c55e',weight:3,fillOpacity:.12}).addTo(reviewLayers);L.circleMarker(g,{radius:8,color:'#fff',weight:3,fillColor:'#ef4444',fillOpacity:1}).bindTooltip('Your guess',{permanent:true,direction:'top',offset:[0,-9],className:'result-label'}).addTo(reviewLayers);L.circleMarker(targetPoint,{radius:8,color:'#fff',weight:3,fillColor:'#22c55e',fillOpacity:1}).bindTooltip('Correct location',{permanent:true,direction:'top',offset:[0,-9],className:'result-label'}).addTo(reviewLayers);const bounds=targetCircle.getBounds();bounds.extend(g);map.fitBounds(bounds,{paddingTopLeft:[28,135],paddingBottomRight:[28,175],maxZoom:16,animate:true})}
    '''
    text = regex_once(
        text,
        r"function confirmGuess\(\)\{.*?\}\n    function endOpenDrill\(\)",
        review_functions + "function endOpenDrill()",
        "geo persistent review flow",
        flags=re.S,
    )

    path.write_text(text, encoding="utf-8")


def patch_simulator(path: Path) -> None:
    text = path.read_text(encoding="utf-8")

    enhancement_css = r'''
        /* Heading-up map orientation and non-navigating attribution. */
        .leaflet-map-pane { will-change:transform,rotate; }
        .leaflet-control-attribution, .leaflet-control-attribution a { pointer-events:none!important; user-select:none; color:inherit; text-decoration:none; }
        #map-orientation-controls { position:absolute; right:15px; bottom:92px; z-index:1250; display:flex; flex-direction:column; align-items:center; gap:7px; pointer-events:none; }
        #orientation-toggle { pointer-events:auto; min-width:86px; padding:8px 10px; border:1px solid #555; border-radius:6px; background:rgba(25,25,25,.94); color:#fff; box-shadow:0 3px 12px rgba(0,0,0,.4); font-size:11px; font-weight:800; cursor:pointer; }
        #orientation-toggle.active { border-color:#ffcc00; color:#ffdf55; background:rgba(35,31,16,.96); }
        #compass { width:48px; height:48px; display:grid; place-items:center; border:1px solid #666; border-radius:50%; background:rgba(20,20,20,.92); box-shadow:0 3px 12px rgba(0,0,0,.45); overflow:hidden; }
        #compass-needle { position:relative; width:5px; height:34px; transform-origin:50% 50%; }
        #compass-needle::before { content:''; position:absolute; left:0; top:0; width:0; height:0; border-left:3px solid transparent; border-right:3px solid transparent; border-bottom:17px solid #ef4444; transform:translateX(-.5px); }
        #compass-needle::after { content:''; position:absolute; left:1px; bottom:1px; width:4px; height:16px; background:#d6d6d6; clip-path:polygon(50% 100%,0 0,100% 0); }
        #compass-n { position:absolute; top:2px; left:50%; transform:translateX(-50%); color:#fff; font-size:8px; font-weight:900; line-height:1; }
        @media (max-width:600px) { #map-orientation-controls { right:10px; bottom:100px; } #orientation-toggle { min-width:78px; padding:7px 8px; } #compass { width:44px; height:44px; } }
'''
    text = replace_once(text, "    </style>", enhancement_css + "    </style>", "simulator orientation CSS")

    controls_html = '''    <div id="map-orientation-controls" aria-label="Map orientation controls">
        <button id="orientation-toggle" type="button" aria-pressed="false" onclick="toggleHeadingUp()">North Up</button>
        <div id="compass" aria-label="Compass pointing north"><div id="compass-needle"><span id="compass-n">N</span></div></div>
    </div>

'''
    text = replace_once(text, "    <div id=\"map\"></div>", controls_html + "    <div id=\"map\"></div>", "simulator orientation controls")

    text = replace_once(
        text,
        "let tileLayerInstance = null;",
        "let tileLayerInstance = null;\n        let headingUpMode = false;",
        "simulator heading mode variable",
    )

    text = replace_once(
        text,
        "            mapInstance.zoomControl.setPosition('bottomright');",
        "            mapInstance.zoomControl.setPosition('bottomright');\n            mapInstance.attributionControl.setPrefix(false);\n            mapInstance.on('move zoom resize', () => requestAnimationFrame(updateMapOrientation));",
        "simulator map setup",
    )

    orientation_functions = r'''        function toggleHeadingUp() {
            headingUpMode = !headingUpMode;
            const button = document.getElementById('orientation-toggle');
            button.classList.toggle('active', headingUpMode);
            button.setAttribute('aria-pressed', String(headingUpMode));
            button.innerText = headingUpMode ? 'Heading Up' : 'North Up';
            if (headingUpMode && mapInstance) mapInstance.setView([simLat, simLng], mapInstance.getZoom(), { animate: false });
            updateMapOrientation();
        }

        function updateMapOrientation() {
            if (!mapInstance) return;
            const mapPane = mapInstance.getPane('mapPane');
            if (!mapPane) return;
            const rotation = headingUpMode ? -currentHeading : 0;
            const truckPoint = mapInstance.latLngToLayerPoint([simLat, simLng]);
            mapPane.style.transformOrigin = `${truckPoint.x}px ${truckPoint.y}px`;
            mapPane.style.rotate = `${rotation}deg`;
            const needle = document.getElementById('compass-needle');
            if (needle) needle.style.transform = `rotate(${rotation}deg)`;
        }

'''
    text = replace_once(text, "        function togglePanel() {", orientation_functions + "        function togglePanel() {", "simulator orientation functions")

    text = replace_once(
        text,
        "                mapInstance.invalidateSize();\n            }\n            if (simulationState === STATES.ENROUTE) evaluateDistanceToTarget();",
        "                mapInstance.invalidateSize();\n                updateMapOrientation();\n            }\n            if (simulationState === STATES.ENROUTE) evaluateDistanceToTarget();",
        "simulator teleport orientation refresh",
    )

    old_camera = "                if (document.getElementById('chk-camera').checked && mapInstance && velocity !== 0) {\n                    mapInstance.setView([simLat, simLng], mapInstance.getZoom(), { animate: false });\n                }"
    new_camera = "                if (mapInstance && ((document.getElementById('chk-camera').checked && velocity !== 0) || headingUpMode)) {\n                    mapInstance.setView([simLat, simLng], mapInstance.getZoom(), { animate: false });\n                }"
    text = replace_once(text, old_camera, new_camera, "simulator heading camera lock")

    text = regex_once(
        text,
        r"(document\.getElementById\('tel-hdg'\)\.innerText = Math\.round\(currentHeading\) \+ \"[^\"]+\";[ \t]*)(\r?\n[ \t]*\})",
        r"\1\n                updateMapOrientation();\2",
        "simulator live orientation update",
    )

    path.write_text(text, encoding="utf-8")


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    geo = repo / "geo-guesser" / "index.html"
    simulator = repo / "response-simulator" / "index.html"
    patch_geo(geo)
    patch_simulator(simulator)
    print("Applied map orientation and Geo Guesser review enhancements.")


if __name__ == "__main__":
    main()
