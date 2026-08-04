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
assert '0.6.0-phase3' in text, 'Version is not current'
assert 'wanted' not in text.lower(), 'Wanted-system text must not be present'
assert 'src/main.js?v=0.6.0-phase3' in text, 'Phase 3 main cache key is missing'
for match in re.findall(r'(?:src|href)="([^"]+)"', text):
    if match.startswith(('http:', 'https:', '#')): continue
    path = (HTML.parent / match.split('?')[0]).resolve()
    assert path.exists(), f'Missing local asset: {match}'
styles = (HTML.parent / 'styles.css').read_text(encoding='utf-8')
assert 'styles-phase3.css' in styles, 'Phase 3 stylesheet is not loaded'
for css_import in re.findall(r"@import url\(['\"]?([^'\")]+)", styles):
    path = (HTML.parent / css_import.split('?')[0]).resolve()
    assert path.exists(), f'Missing CSS module: {css_import}'
main = (HTML.parent / 'src' / 'main.js').read_text(encoding='utf-8')
assert 'Phase3Controller' in main and '__PFR_PHASE3__' in main, 'Phase 3 controller is not booted'
assert (HTML.parent / 'src' / 'operation-engine.js').exists(), 'Operation engine is missing'
print('Static HTML/assets/CSS/Phase3 boot: PASS')
