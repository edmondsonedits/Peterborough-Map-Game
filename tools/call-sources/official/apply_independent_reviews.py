"""Apply versioned independent reviews to existing generated outputs (no downloads)."""
import json
from official_common import configuration
from official_reviews import load_reviews, apply_review

cfg = configuration('Apply evidence-backed semantic review flags/name/type corrections; never replace coordinates.')
reviews = load_reviews(cfg.package_dir)
changed = []
for directory in ['normalized', 'facility-core', 'facility-provenance', 'site-deduped']:
    folder = cfg.output_dir / directory
    for path in sorted(folder.glob('*.json')):
        text = path.read_text()
        if not any(record_id in text for record_id in reviews):
            continue
        rows = json.loads(text)
        if not isinstance(rows, list):
            continue
        applied = 0
        for row in rows:
            if row.get('id') in reviews:
                apply_review(row, reviews)
                applied += 1
        if applied:
            path.write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')))
            changed.append({'file':str(path.relative_to(cfg.output_dir)), 'reviewedRecords':applied})
(cfg.output_dir/'independent-review-application.json').write_text(json.dumps(changed,indent=2)+'\n')
print(json.dumps(changed,indent=2))
