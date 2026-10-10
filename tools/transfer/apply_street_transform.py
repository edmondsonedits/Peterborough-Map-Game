#!/usr/bin/env python3
"""One-use, branch-only transport of locally tested text edits; no dynamic execution."""
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path

BRANCH = 'fix/citywide-street-markings-20261010'
if os.environ.get('GITHUB_REF_NAME') != BRANCH:
    raise SystemExit('Refusing to edit any other branch')
folder = Path('tools/transfer')
encoded = ''.join(''.join((folder / f'street-transform.{i}.b64').read_text().split()) for i in range(1, 5))
raw = gzip.decompress(base64.b64decode(encoded, validate=True))
if hashlib.sha256(raw).hexdigest() != '8467a7383a3f595db53f44e1585823068eb265dd72ea24995c90411f4af20b4c':
    raise SystemExit('Transfer checksum mismatch; no files changed')
spec = json.loads(raw)
allowed = {
 'city-explorer/app.js', 'city-explorer/city-detail-rules.js', 'city-explorer/data/street-review-sites.json',
 'city-explorer/index.html', 'city-explorer/official-road-surfaces.js', 'city-explorer/reviewed-street-markings.js',
 'city-explorer/road-network.js', 'city-explorer/road-orientation-fix.js', 'city-explorer/street-paint-renderer.js',
 'docs/STREET-APPEARANCE-AUDIT-2026-10-10.md', 'docs/road-audit/2026-10-10-summary.json',
 'tools/check-street-visuals.cjs', 'tools/geospatial/audit_street_appearance.py', 'tools/geospatial/collect_lane_records.py',
 'tools/test_city_detail_rules.mjs', 'tools/test_city_editor_release.mjs', 'tools/test_street_marking_fidelity.mjs',
}
if set(spec) != allowed:
    raise SystemExit('Unexpected edit scope')
pending = {}
for name, change in spec.items():
    path = Path(name)
    if 'content' in change:
        if path.exists():
            raise SystemExit('New path already exists: ' + name)
        updated = change['content'].encode()
    else:
        old = path.read_bytes()
        if hashlib.sha256(old).hexdigest() != change['sha256']:
            raise SystemExit('Source changed; refusing stale edit: ' + name)
        lines = old.decode().splitlines(keepends=True)
        for start, end, replacement in reversed(change['edits']):
            lines[start:end] = [replacement]
        updated = ''.join(lines).encode()
    if hashlib.sha256(updated).hexdigest() != change['after']:
        raise SystemExit('Output does not match tested source: ' + name)
    pending[path] = updated
for path, updated in pending.items():
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(updated)
Path('/tmp/street-changed-files.txt').write_text('\n'.join(sorted(allowed)) + '\n')
for part in folder.glob('street-transform.*.b64'):
    part.unlink()
Path(__file__).unlink()
print('Applied', len(pending), 'validated files; transfer helpers removed. Main unchanged.')
