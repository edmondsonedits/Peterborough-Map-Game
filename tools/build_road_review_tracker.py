#!/usr/bin/env python3
"""Deterministic review queue, never a source-data correction or field certificate."""
import argparse
import csv
from datetime import date
import hashlib
import io
import json
from pathlib import Path
import sys

REQUIRED_EXPECTATIONS = ('status', 'comparisonReview', 'osmLanes', 'ornLaneValues')
REQUIRED_EVIDENCE = ('reviewDate', 'sourceURLs', 'acquisitionUncertainty', 'confidenceBasis',
                     'nextCheck', 'reviewCoverage', 'evidenceKind', 'finding')
COVERAGE = {'documented-historical-evidence', 'bounded-imagery-review', 'source-comparison-only', 'partial-historical-paint-profile'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def stable_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n'


def csv_safe(value):
    if isinstance(value, (list, dict)):
        value = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    elif isinstance(value, bool):
        value = str(value).lower()
    elif value is None:
        value = ''
    value = str(value)
    # Quoting alone does not prevent spreadsheet formula evaluation. Preserve
    # exact source values in JSON; prefix dangerous CSV cells with an apostrophe.
    if value.lstrip().startswith(('=', '+', '-', '@')) or value.startswith(('\t', '\r', '\n')):
        value = "'" + value
    return value


def checked_path(root, name):
    path = (root / name).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError(f'path outside root: {name}')
    return path


def build(audit, ledger, root, input_hashes):
    if audit.get('schemaVersion') not in (2, 3) or ledger.get('schemaVersion') != 1:
        raise ValueError('unsupported audit or ledger schemaVersion')
    roads = {}
    for road in audit['roads']:
        osm_id = road['osmId']
        if not isinstance(osm_id, str) or not osm_id.isdigit() or osm_id in roads:
            raise ValueError(f'duplicate or invalid audit osmId: {osm_id}')
        roads[osm_id] = road
    if audit.get('summary', {}).get('renderedWays', len(roads)) != len(roads):
        raise ValueError('audit summary renderedWays differs from inventory')
    reviews = {}
    for review in ledger['reviews']:
        osm_id = review['osmId']
        if osm_id in reviews or osm_id not in roads:
            raise ValueError(f'duplicate or unknown ledger osmId: {osm_id}')
        expected = review.get('expectedAudit', {})
        if any(field not in expected for field in REQUIRED_EXPECTATIONS):
            raise ValueError(f'missing expectedAudit fields: {osm_id}')
        for field, value in expected.items():
            if field not in roads[osm_id] or roads[osm_id][field] != value:
                raise ValueError(f'stale ledger expectedAudit: {osm_id} {field}')
        if any(not review.get(field) for field in REQUIRED_EVIDENCE):
            raise ValueError(f'missing evidence fields: {osm_id}')
        if date.fromisoformat(review['reviewDate']).isoformat() != review['reviewDate']:
            raise ValueError(f'invalid reviewDate: {osm_id}')
        urls = review['sourceURLs']
        if not isinstance(urls, list) or not all(isinstance(url, str) and url.startswith(('https://', 'http://')) for url in urls):
            raise ValueError(f'invalid sourceURLs: {osm_id}')
        if review['reviewCoverage'] not in COVERAGE:
            raise ValueError(f'unsupported reviewCoverage: {osm_id}')
        if review.get('currentConditionsVerified') is not False:
            raise ValueError(f'currentConditionsVerified must be false: {osm_id}')
        if not isinstance(review.get('flagged'), bool):
            raise ValueError(f'flagged must be explicit boolean: {osm_id}')
        reviews[osm_id] = review
    drift = []
    for category in ('hashes', 'codeHashes'):
        for name, expected in sorted(audit.get(category, {}).items()):
            path = checked_path(root, name)
            actual = digest(path.read_bytes()) if path.is_file() else None
            if actual != expected:
                drift.append({'kind': 'source' if category == 'hashes' else 'evaluator',
                              'path': name, 'expected': expected, 'actual': actual})
    rows = []
    for osm_id, road in sorted(roads.items(), key=lambda pair: int(pair[0])):
        review = reviews.get(osm_id)
        rows.append({'osmId': osm_id, 'name': road.get('name', ''), 'auditEvidence': road,
                     'ledgerPresent': review is not None,
                     'reviewCoverage': review['reviewCoverage'] if review else 'unreviewed',
                     'flagged': review['flagged'] if review else road['status'] == 'lane-count-conflict',
                     'currentConditionsVerified': False,
                     'sourceConflictResolved': False,
                     'review': review})
    conflicts = [row for row in rows if row['auditEvidence']['status'] == 'lane-count-conflict']
    gate_pass = sum(row['auditEvidence']['comparisonReview'] == 'lane-count-review' for row in conflicts)
    return {'schemaVersion': 1, 'inputHashes': input_hashes, 'auditHashDrift': drift,
            'meaning': 'Machine inventory plus explicitly scoped evidence. Absence of a flag is not review. Historical imagery does not verify current conditions. No source conflicts are resolved here.',
            'summary': {'renderedWays': len(rows), 'ledgerPresent': len(reviews),
                        'unreviewed': len(rows) - len(reviews), 'rawConflicts': len(conflicts),
                        'gatePassConflicts': gate_pass, 'compatibilityBlockedConflicts': len(conflicts) - gate_pass,
                        'currentConditionsVerified': 0, 'sourceConflictsResolved': 0},
            'rows': rows}


def make_csv(document):
    columns = ['osmId', 'name', 'status', 'comparisonReview', 'osmLanes', 'ornLaneValues',
               'rawOsmTags', 'ornIds', 'ornEffectiveDates', 'ledgerPresent', 'reviewCoverage',
               'flagged', 'currentConditionsVerified', 'sourceConflictResolved', 'reviewDate',
               'sourceURLs', 'acquisitionUncertainty', 'confidenceBasis', 'nextCheck', 'finding']
    buffer = io.StringIO(newline='')
    writer = csv.DictWriter(buffer, fieldnames=columns, lineterminator='\n')
    writer.writeheader()
    for row in document['rows']:
        road, review = row['auditEvidence'], row['review'] or {}
        values = {**road, **review, **row, 'rawOsmTags': road.get('tags', {})}
        writer.writerow({field: csv_safe(values.get(field)) for field in columns})
    return buffer.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--audit', default='docs/street-audit/network-audit.json')
    parser.add_argument('--ledger', default='docs/street-audit/road-review-ledger.json')
    parser.add_argument('--json', default='docs/street-audit/road-review-queue.json')
    parser.add_argument('--csv', default='docs/street-audit/road-review-queue.csv')
    parser.add_argument('--check', action='store_true', help='fail on stale artifacts, evidence or audit input/evaluator drift')
    args = parser.parse_args()
    try:
        audit_bytes = checked_path(args.root, args.audit).read_bytes()
        ledger_bytes = checked_path(args.root, args.ledger).read_bytes()
        document = build(json.loads(audit_bytes), json.loads(ledger_bytes), args.root,
                         {'audit': digest(audit_bytes), 'ledger': digest(ledger_bytes),
                          'generator': digest(Path(__file__).read_bytes())})
        artifacts = {args.json: stable_json(document), args.csv: make_csv(document)}
        if args.check:
            stale = [name for name, text in artifacts.items()
                     if not checked_path(args.root, name).is_file()
                     or checked_path(args.root, name).read_bytes() != text.encode('utf-8')]
            if stale or document['auditHashDrift']:
                raise ValueError(f'stale artifacts: {stale}; audit hash drift: {document["auditHashDrift"]}')
        else:
            for name, text in artifacts.items():
                path = checked_path(args.root, name)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(text.encode('utf-8'))
        print(stable_json({'summary': document['summary'], 'auditHashDrift': document['auditHashDrift']}), end='')
    except (KeyError, TypeError, ValueError, OSError) as error:
        print(f'road review tracker: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
