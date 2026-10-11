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


def paint_eligibility(root, ways):
    """Evaluate real whole-source runtime guards; final pavement support is unknown.

    Fail loudly if Node or any evaluator dependency fails. Eligibility never
    means paint was emitted or that current field conditions were verified.
    """
    result = subprocess.run(['node', str(root / 'tools/evaluate_historical_paint.mjs')],
                            input=json.dumps(ways), capture_output=True, text=True,
                            check=True)
    return json.loads(result.stdout)


def paint_overrides(root, ways):
    """Compatibility view of eligible evidence IDs, not renderer emission."""
    return {key: value['evidence'] for key, value in paint_eligibility(root, ways).items()}
