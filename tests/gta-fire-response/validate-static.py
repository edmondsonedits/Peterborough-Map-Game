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
assert '1.0.0-phase5' in text, 'Complete-release version is not current'
assert 'wanted' not in text.lower(), 'Wanted-system text must not be present'
assert 'src/main.js?v=1.0.0-phase5' in text, 'Phase 5 main cache key is missing'
for match in re.findall(r'(?:src|href)="([^"]+)"', text):
    if match.startswith(('http:', 'https:', '#')): continue
    path = (HTML.parent / match.split('?')[0]).resolve()
    assert path.exists(), f'Missing local asset: {match}'
styles = (HTML.parent / 'styles.css').read_text(encoding='utf-8')
for phase in ('styles-phase3.css', 'styles-phase4.css', 'styles-phase5.css'):
    assert phase in styles, f'{phase} is not loaded'
for css_import in re.findall(r"@import url\(['\"]?([^'\")]+)", styles):
    path = (HTML.parent / css_import.split('?')[0]).resolve()
    assert path.exists(), f'Missing CSS module: {css_import}'
main = (HTML.parent / 'src' / 'main.js').read_text(encoding='utf-8')
for phase in ('Phase3Controller', 'Phase4Controller', 'Phase5Controller'):
    assert phase in main, f'{phase} is not booted'
for global_name in ('__PFR_PHASE3__', '__PFR_PHASE4__', '__PFR_PHASE5__'):
    assert global_name in main, f'{global_name} is not exposed for verification'
required = [
    'operation-engine.js', 'phase4-save.js', 'phase4-data.js',
    'phase5.js', 'phase5-data.js', 'phase5-math.js', 'phase5-save.js', 'phase5-ui.js'
]
for filename in required:
    assert (HTML.parent / 'src' / filename).exists(), f'Missing complete-release module: {filename}'
phase5_data = (HTML.parent / 'src' / 'phase5-data.js').read_text(encoding='utf-8')
assert phase5_data.count("id:'") >= 30, 'Phase 5 content roster appears incomplete'
print('Static HTML/assets/CSS/Phase5 complete-release boot: PASS')
