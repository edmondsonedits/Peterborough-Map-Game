"""Apply evidence-backed, versioned semantic reviews; never substitute coordinates."""
from __future__ import annotations
import json
from pathlib import Path


def load_reviews(package_dir: Path) -> dict:
    path = package_dir / 'independent-source-reviews.json'
    if not path.exists():
        return {}
    data = json.loads(path.read_text())
    return {row['id']: row for row in data['reviews']}


def apply_review(row: dict, reviews: dict) -> dict:
    review = reviews.get(row.get('id'))
    if not review:
        return row
    original = row.get('independentSourceReview', {}).get('originalCandidate') or {
        'name': row.get('name'), 'addr': row.get('addr'), 'category': row.get('category')}
    evidence = {key: review[key] for key in ['status', 'reason', 'sourceUrls', 'retrievedAt']}
    evidence.update(reviewer=review.get('reviewer'), coordinatesVerified=False, originalCandidate=original)
    prior = row.get('verifiedcurrentness')
    if prior and prior.get('method') != 'independent-official-operator-or-public-body-web-review':
        evidence['priorCurrentnessEvidence'] = prior
    elif row.get('independentSourceReview', {}).get('priorCurrentnessEvidence'):
        evidence['priorCurrentnessEvidence'] = row['independentSourceReview']['priorCurrentnessEvidence']
    row['independentSourceReview'] = evidence
    row['sourceUrls'] = list(dict.fromkeys(row.get('sourceUrls', []) + review['sourceUrls']))
    # A revised review supersedes its earlier status flag.
    flags = [flag for flag in row.get('reviewFlags', [])
             if not flag.startswith('independent-source-review-')]
    if review['status'] == 'rejected':
        flags.append('independent-source-review-rejected')
        row.pop('verifiedcurrentness', None)
    elif review['status'] == 'unresolved':
        flags.append('independent-source-review-unresolved')
    else:
        for key, value in review.get('changes', {}).items():
            if key not in ['name', 'category']:
                raise ValueError(f'Unsupported review change {key}; coordinate/address replacement is prohibited')
            old = row.get(key)
            if key == 'name' and old and old != value:
                row['aliases'] = list(dict.fromkeys(row.get('aliases', []) + [old]))
            row[key] = value
        row['verifiedcurrentness'] = {
            'method': 'independent-official-operator-or-public-body-web-review',
            'sourceUrls': review['sourceUrls'], 'retrievedAt': review['retrievedAt'],
            'reason': review['reason'], 'coordinatesVerified': False,
            'limitations': 'Corroborates the named facility/address or specified semantic correction only; not a verified vehicle entrance.'}
        flags.append('independent-source-review-' + review['status'])
    row['reviewFlags'] = list(dict.fromkeys(flags + review.get('reviewFlags', [])))
    return row
