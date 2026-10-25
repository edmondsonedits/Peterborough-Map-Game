import json,importlib.util
from pathlib import Path
root=Path(r"H:\ChatGPT\Peterborough-Building-References-20261024\business-signs")
spec=importlib.util.spec_from_file_location("chamber",Path(__file__).with_name("ingest-chamber.py"));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
chamber=json.loads((root/"chamber-businesses-normalized.json").read_text(encoding="utf-8"));by_id={r["id"]:r for r in chamber["businesses"]}
for r in module.parse((root/"chamber-results.html").read_text(encoding="utf-8"),"https://web.pkchamber.ca/advancedsearch","Peterborough search"):by_id.setdefault(r["id"],r)
chamber["businesses"]=list(by_id.values());chamber["searchResultRecords"]=33
(root/"chamber-combined-normalized.json").write_text(json.dumps(chamber,ensure_ascii=False,indent=2),encoding="utf-8")
rows=[];sources=[]
for filename in ["osm-citywide-normalized.json","city-businesses-normalized.json","chamber-combined-normalized.json","boro-businesses-normalized.json","ptbo-businesses-normalized.json"]:
 if not (root/filename).exists():continue
 data=json.loads((root/filename).read_text(encoding="utf-8"));rows.extend(data["businesses"]);sources.append({"file":filename,"records":len(data["businesses"])})
(root/"businesses-combined.json").write_text(json.dumps({"businesses":rows,"sources":sources},ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps({"records":len(rows),"sources":sources}))
