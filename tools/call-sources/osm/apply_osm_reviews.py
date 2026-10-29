"""Apply versioned independent currentness evidence to OSM shortlist bundles; never alter coordinates/address."""
import argparse,json,sys,hashlib
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--repo',type=Path);p.add_argument('--cache',type=Path,required=True);p.add_argument('--manifest',type=Path);a=p.parse_args();ROOT=a.cache.resolve()
sys.path.insert(0,str(Path(__file__).resolve().parent))
from osm_reviews import apply_review,load_reviews
if a.manifest:
 data=json.loads(a.manifest.read_text());reviews={r['id']:r for r in data['reviews']}
else:reviews=load_reviews(ROOT) or load_reviews(Path(__file__).resolve().parent)
found={};files=[]
for path in sorted((ROOT/'bundles').glob('*candidates.json')):
 data=json.loads(path.read_text());n=0
 for row in data['locations']:
  if row['id'] not in reviews:continue
  before=hashlib.sha256(json.dumps({k:row.get(k) for k in ['lat','lng','address','addr','sourceGeometry']},sort_keys=True).encode()).hexdigest()
  apply_review(row,reviews);row['sources']=list(dict.fromkeys(row.get('sources',[])+reviews[row['id']]['sourceUrls']))
  after=hashlib.sha256(json.dumps({k:row.get(k) for k in ['lat','lng','address','addr','sourceGeometry']},sort_keys=True).encode()).hexdigest()
  if before!=after:raise AssertionError('Independent review altered source position/address')
  found[row['id']]=row['independentSourceReview'];n+=1
 if n:
  temp=path.with_suffix('.review.tmp');temp.write_text(json.dumps(data,separators=(',',':')));temp.replace(path);files.append({'file':path.name,'reviewedRows':n})
(ROOT/'bundles/independent-review-application.json').write_text(json.dumps({'uniqueReviewedRows':len(found),'files':files,'reviews':found,'coordinatesAndAddressesPreserved':True},indent=2));print({'uniqueReviewedRows':len(found),'files':files,'coordinatesAndAddressesPreserved':True})
