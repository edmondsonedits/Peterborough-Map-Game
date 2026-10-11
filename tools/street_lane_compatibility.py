"""Conservative lane comparison; compatibility is not field verification."""
import json
import subprocess


def direction_compatibility(tags, orn_flow, heading_dot):
    """ORN Positive/Negative refer to ORN geometry, not compass directions."""
    value = str(tags.get('oneway', '')).lower()
    if any(key.startswith('oneway:') for key in tags):
        return 'unknown-direction'
    if value in ('yes', '1', 'true'):
        osm_direction = 1
    elif value == '-1':
        osm_direction = -1
    elif value in ('no', '0', 'false'):
        osm_direction = 0
    elif value == '' and tags.get('junction') != 'roundabout' and tags.get('highway') not in ('motorway', 'motorway_link'):
        osm_direction = 0
    else:
        # Do not silently infer conditional or implicit travel directions.
        return 'unknown-direction'
    if orn_flow not in ('Both', 'Positive', 'Negative'):
        return 'unknown-direction'
    if (osm_direction == 0) != (orn_flow == 'Both'):
        return 'carriageway-mismatch'
    if osm_direction == 0:
        return 'compatible'
    orn_direction = 1 if orn_flow == 'Positive' else -1
    return 'compatible' if osm_direction * orn_direction * heading_dot > 0 else 'opposite-direction'


def comparison_review(raw_status, counts):
    if any(value for key, value in counts.items() if key != 'compatible'):
        return 'source-compatibility-review'
    if raw_status == 'lane-count-conflict':
        return 'lane-count-review'
    if raw_status == 'lane-count-agrees':
        return 'count-agrees-not-field-verified'
    if raw_status == 'missing-OSM-count':
        return 'missing-count-review'
    return 'insufficient-evidence'


def paint_overrides(root, ways):
    """Evaluate the actual renderer guard, not a duplicate list of reviewed IDs.

    Data-URL import keeps the standalone ESM module usable without changing the
    repository's module mode. Fail loudly rather than label an unchecked paint
    override as applied. No renderer file is modified.
    """
    script = """
import fs from 'node:fs';
const source = fs.readFileSync(process.argv[1], 'utf8');
const { reviewedPaintTags } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const ways = JSON.parse(fs.readFileSync(0, 'utf8'));
const result = {};
for (const way of ways) {
  const tags = reviewedPaintTags(way.tags || {}, String(way.id));
  if (tags !== way.tags && tags['sim:paint:evidence']) result[String(way.id)] = tags['sim:paint:evidence'];
}
process.stdout.write(JSON.stringify(result));
"""
    result = subprocess.run(['node', '--input-type=module', '-e', script,
                             str(root / 'city-explorer/street-paint.js')],
                            input=json.dumps(ways), capture_output=True, text=True,
                            check=True)
    return json.loads(result.stdout)
