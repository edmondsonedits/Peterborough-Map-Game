#!/usr/bin/env python3
import base64, json, os, shutil, socket, subprocess, tempfile, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import requests
import websocket

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass

def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

class CDP:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=10)
        self.counter = 0
        self.events = []
    def call(self, method, params=None):
        self.counter += 1
        ident = self.counter
        self.ws.send(json.dumps({'id': ident, 'method': method, 'params': params or {}}))
        while True:
            message = json.loads(self.ws.recv())
            if message.get('id') == ident:
                if 'error' in message: raise RuntimeError(message['error'])
                return message.get('result', {})
            self.events.append(message)
    def evaluate(self, expression):
        result = self.call('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
        if result.get('exceptionDetails'): raise RuntimeError(result['exceptionDetails'])
        return result.get('result', {}).get('value')
    def wait(self, expression, timeout=10):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if self.evaluate(expression): return True
            except Exception:
                pass
            time.sleep(.1)
        raise TimeoutError(expression)
    def screenshot(self, name):
        data = self.call('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False})['data']
        (OUT / name).write_bytes(base64.b64decode(data))

def key(cdp, code, key, down=True):
    cdp.call('Input.dispatchKeyEvent', {'type': 'keyDown' if down else 'keyUp', 'code': code, 'key': key, 'windowsVirtualKeyCode': ord(key.upper()) if len(key) == 1 else 0})

def run():
    server_port, debug_port = free_port(), free_port()
    os.chdir(ROOT)
    server = ThreadingHTTPServer(('127.0.0.1', server_port), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    profile = tempfile.mkdtemp(prefix='pfr-chrome-')
    chromium = shutil.which('chromium') or shutil.which('chromium-browser')
    if not chromium: raise RuntimeError('Chromium not found')
    process = subprocess.Popen([
        chromium, '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        f'--remote-debugging-port={debug_port}', '--remote-allow-origins=*', f'--user-data-dir={profile}', '--window-size=390,844',
        '--host-resolver-rules=MAP unpkg.com 127.0.0.1,MAP server.arcgisonline.com 127.0.0.1,MAP services.arcgisonline.com 127.0.0.1',
        'about:blank'
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(80):
            try:
                requests.get(f'http://127.0.0.1:{debug_port}/json/version', timeout=.2).raise_for_status(); break
            except Exception: time.sleep(.1)
        target = requests.put(f'http://127.0.0.1:{debug_port}/json/new?about:blank', timeout=2).json()
        cdp = CDP(target['webSocketDebuggerUrl'])
        cdp.call('Page.enable'); cdp.call('Runtime.enable'); cdp.call('Log.enable'); cdp.call('Emulation.setDeviceMetricsOverride', {'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
        url = f'http://127.0.0.1:{server_port}/gta-fire-response/?test=1&tiles=off&debug=1&call=structure&seed=123'
        cdp.call('Page.navigate', {'url': url})
        cdp.wait("document.readyState === 'complete' && !!window.__PFR_PHASE1_GAME__", 15)
        cdp.wait("!document.getElementById('start-button').disabled", 5)
        layout_matrix = {}
        for width,height in [(360,800),(390,844),(412,915),(768,1024)]:
            cdp.call('Emulation.setDeviceMetricsOverride', {'width':width,'height':height,'deviceScaleFactor':1,'mobile':width<769})
            time.sleep(.08)
            dimensions = cdp.evaluate('({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight})')
            assert dimensions['sw'] <= dimensions['w'] and dimensions['sh'] <= dimensions['h'], dimensions
            layout_matrix[f'{width}x{height}'] = 'no-scroll'
        cdp.call('Emulation.setDeviceMetricsOverride', {'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
        cdp.screenshot('phase1-start-mobile.png')
        cdp.evaluate("document.getElementById('start-button').click()")
        cdp.wait("window.__PFR_PHASE1_GAME__.state.current === 'DISPATCHED'", 5)

        before = cdp.evaluate('window.__PFR_PHASE1_GAME__.player.lng')
        cdp.call('Input.dispatchKeyEvent', {'type':'keyDown','key':'ArrowRight','code':'ArrowRight'})
        time.sleep(.65)
        cdp.call('Input.dispatchKeyEvent', {'type':'keyUp','key':'ArrowRight','code':'ArrowRight'})
        after = cdp.evaluate('window.__PFR_PHASE1_GAME__.player.lng')
        assert after > before, (before, after)

        cdp.evaluate("(()=>{const game=window.__PFR_PHASE1_GAME__; Object.assign(game.player,game.closestDoorPoint()); game.enterTruck();})()")
        cdp.wait("window.__PFR_PHASE1_GAME__.mode === 'truck'", 3)
        key(cdp, 'KeyL', 'l'); key(cdp, 'KeyL', 'l', False)
        key(cdp, 'KeyQ', 'q'); key(cdp, 'KeyQ', 'q', False)
        cdp.call('Input.dispatchKeyEvent', {'type':'keyDown','key':'ArrowRight','code':'ArrowRight'})
        time.sleep(1.4)
        cdp.call('Input.dispatchKeyEvent', {'type':'keyUp','key':'ArrowRight','code':'ArrowRight'})
        cdp.wait("Math.abs(window.__PFR_PHASE1_GAME__.truck.speed) > 0.1", 3)
        drive_speed = abs(cdp.evaluate('window.__PFR_PHASE1_GAME__.truck.speed')) * 3.6
        drive_traffic = cdp.evaluate('window.__PFR_PHASE1_GAME__.traffic.activeCount()')
        cdp.screenshot('phase1-driving-mobile.png')
        cdp.call('Emulation.setDeviceMetricsOverride', {'width':1366,'height':768,'deviceScaleFactor':1,'mobile':False})
        time.sleep(.25)
        cdp.screenshot('phase1-driving-desktop.png')
        cdp.call('Emulation.setDeviceMetricsOverride', {'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})

        cdp.evaluate("""
          (()=>{const game=window.__PFR_PHASE1_GAME__;
          Object.assign(game.truck,{lat:game.activeCall.lat,lng:game.activeCall.lng,speed:0});
          if(game.state.current==='ENROUTE') game.state.transition('ARRIVING','smoke-test');
          game.incident.arrive();
          game.exitTruck();
          Object.assign(game.player,game.incident.rearCompartmentPoint());
          game.incident.interact(game.player);
          game.incident.selectTool('hose');
          game.player.lat=game.activeCall.lat-0.000075; game.player.lng=game.activeCall.lng; game.player.heading=0;
          game.input.actionHeld=true;})()
        """)
        cdp.wait("window.__PFR_PHASE1_GAME__.state.current === 'ON_SCENE'", 3)
        time.sleep(.45)
        cdp.screenshot('phase1-onscene-mobile.png')
        cdp.wait("window.__PFR_PHASE1_GAME__.state.current === 'CALL_COMPLETE'", 7)
        result_visible = cdp.evaluate("document.getElementById('result-panel').classList.contains('show')")
        assert result_visible
        cdp.evaluate("""(()=>{const game=window.__PFR_PHASE1_GAME__; game.input.actionHeld=false; for(let i=0;i<12;i++){ if(game.state.current==='CALL_COMPLETE') game.returnToStation(); game.dispatchCountdown=null; if(game.state.current==='AVAILABLE') game.dispatchCall(game.selectCall()); if(game.state.current==='DISPATCHED') game.state.transition('ON_SCENE','reset-soak'); if(game.state.current==='ON_SCENE') game.completeCall('reset-soak'); } if(game.state.current==='CALL_COMPLETE') game.returnToStation();})()""")
        time.sleep(.35)
        post_reset_entities = cdp.evaluate('window.__PFR_PHASE1_GAME__.renderer.entityCount()')
        post_reset_traffic = cdp.evaluate('window.__PFR_PHASE1_GAME__.traffic.activeCount()')
        assert post_reset_traffic == 0 and post_reset_entities <= 4, (post_reset_entities, post_reset_traffic)
        js_exceptions = [event for event in cdp.events if event.get('method') == 'Runtime.exceptionThrown']
        assert not js_exceptions, js_exceptions
        print(json.dumps({
            'start_enabled': True,
            'on_foot_movement': True,
            'truck_mode': True,
            'direct_drive_speed_kmh': round(drive_speed,1),
            'traffic_count': drive_traffic,
            'structure_fire_complete': True,
            'result_visible': True,
            'javascript_exceptions': len(js_exceptions),
            'layout_matrix': layout_matrix,
            'repeated_reset_cycles': 12,
            'post_reset_entities': post_reset_entities,
            'post_reset_traffic': post_reset_traffic,
            'screenshots': ['phase1-start-mobile.png','phase1-driving-mobile.png','phase1-driving-desktop.png','phase1-onscene-mobile.png']
        }, indent=2))
    finally:
        server.shutdown(); process.terminate();
        try: process.wait(timeout=3)
        except subprocess.TimeoutExpired: process.kill()
        shutil.rmtree(profile, ignore_errors=True)

if __name__ == '__main__': run()
