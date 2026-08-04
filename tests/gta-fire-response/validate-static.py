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
assert '0.4.0-phase1' in text, 'Version is not current'
assert 'wanted' not in text.lower(), 'Wanted-system text must not be present'
for match in re.findall(r'(?:src|href)="([^"]+)"', text):
    if match.startswith(('http:', 'https:', '#')): continue
    path = (HTML.parent / match.split('?')[0]).resolve()
    assert path.exists(), f'Missing local asset: {match}'
print('Static HTML/assets: PASS')
