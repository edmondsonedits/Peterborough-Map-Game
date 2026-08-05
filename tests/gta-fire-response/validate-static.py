#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
HTML = ROOT / 'gta-fire-response' / 'index.html'

class Parser(HTMLParser):
    pass

text = HTML.read_text(encoding='utf-8')
parser = Parser(); parser.feed(text); parser.close()
assert '1.1.1-station-yard' in text, 'Station-yard hotfix version is not current'
assert 'wanted' not in text.lower(), 'Wanted-system text must not be present'
assert 'src/main.js?v=1.1.1-station-yard' in text, 'Station-yard main cache key is missing'
for match in re.findall(r'(?:src|href)="([^"]+)"', text):
    if match.startswith(('http:', 'https:', '#')): continue
    path = (HTML.parent / match.split('?')[0]).resolve()
    assert path.exists(), f'Missing local asset: {match}'
styles = (HTML.parent / 'styles.css').read_text(encoding='utf-8')
for phase in ('styles-phase3.css', 'styles-phase4.css', 'styles-phase5.css', 'styles-phase5-mobile-controls.css', 'styles-player-benefit.css'):
    assert phase in styles, f'{phase} is not loaded'
assert styles.count('1.1.0-player-benefit') == 11, 'CSS imports do not share one cache boundary'
for css_import in re.findall(r"@import url\(['\"]?([^'\")]+)", styles):
    path = (HTML.parent / css_import.split('?')[0]).resolve()
    assert path.exists(), f'Missing CSS module: {css_import}'
main = (HTML.parent / 'src' / 'main.js').read_text(encoding='utf-8')
for phase in ('Phase3Controller', 'Phase4Controller', 'Phase5Controller'):
    assert phase in main, f'{phase} is not booted'
assert 'installPhase5Polish' in main, 'Phase 5 release hardening is not installed'
assert 'installPlayerBenefitRelease' in main, 'Player-benefit release identity is not installed'
assert 'installStationYardSafeZone' in main, 'Station-yard safe zone is not installed after gameplay phases'
for global_name in ('__PFR_PHASE3__', '__PFR_PHASE4__', '__PFR_PHASE5__'):
    assert global_name in main, f'{global_name} is not exposed for verification'
required = [
    'operation-engine.js', 'phase4-save.js', 'phase4-data.js',
    'phase5.js', 'phase5-polish.js', 'phase5-data.js', 'phase5-math.js', 'phase5-save.js', 'phase5-ui.js',
    'player-benefit-math.js', 'player-benefit-release.js', 'station-yard-safe-zone.js'
]
for filename in required:
    assert (HTML.parent / 'src' / filename).exists(), f'Missing current release module: {filename}'
phase5_data = (HTML.parent / 'src' / 'phase5-data.js').read_text(encoding='utf-8')
assert phase5_data.count("id:'") >= 30, 'Phase 5 content roster appears incomplete'
phase5_polish = (HTML.parent / 'src' / 'phase5-polish.js').read_text(encoding='utf-8')
for requirement in ('call || game.selectCall()', 'pfr-street-shift-phase2', 'driveSpeedScale', 'selectSafeExit', 'migrateProgression', 'migrateSave'):
    assert requirement in phase5_polish, f'Missing audited release safeguard: {requirement}'
station_yard = (HTML.parent / 'src' / 'station-yard-safe-zone.js').read_text(encoding='utf-8')
for requirement in ('yardRadius', 'corridorHalfWidth', 'stationYardContainsXY', 'stationMovement ? 0'):
    assert requirement in station_yard, f'Missing station-yard safeguard: {requirement}'
traffic = (HTML.parent / 'src' / 'traffic.js').read_text(encoding='utf-8')
assert 'laneOffsetMeters' in traffic and 'followingSpeedLimit' in traffic, 'Traffic lane/yield protection is missing'
input_code = (HTML.parent / 'src' / 'input.js').read_text(encoding='utf-8')
assert 'gameplayInputBlocked' in input_code and 'pfr:close-top-ui' in input_code, 'Keyboard isolation is missing'
progression = (HTML.parent / 'src' / 'progression.js').read_text(encoding='utf-8')
assert 'migrateProgression' in progression and 'derived from validated XP' in progression, 'Progression import validation is missing'
mobile_controls = (HTML.parent / 'styles-phase5-mobile-controls.css').read_text(encoding='utf-8')
assert '.phase5-open { right:65px; }' in mobile_controls, 'Mobile OPS and Command controls are not separated'
print('Static HTML/assets/CSS/station-yard hotfix boot: PASS')