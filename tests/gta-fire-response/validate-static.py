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
assert '0.5.0-phase2' in text, 'Version is not current'
assert 'wanted' not in text.lower(), 'Wanted-system text must not be present'
for match in re.findall(r'(?:src|href)="([^"]+)"', text):
    if match.startswith(('http:', 'https:', '#')): continue
    path = (HTML.parent / match.split('?')[0]).resolve()
    assert path.exists(), f'Missing local asset: {match}'
for css_import in re.findall(r"@import url\(['\"]?([^'\")]+)", (HTML.parent / 'styles.css').read_text(encoding='utf-8')):
    path = (HTML.parent / css_import.split('?')[0]).resolve()
    assert path.exists(), f'Missing CSS module: {css_import}'
print('Static HTML/assets/CSS: PASS')
