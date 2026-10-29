"""Bounded civic-cache mining for explicit stations; source-only, never a route assignment."""
import argparse
from collections import Counter
import copy
import hashlib
import json
import math
from pathlib import Path
import re
import sys


def civic_key(address):
    suffixes = {"street": "st", "road": "rd", "drive": "dr", "avenue": "ave",
                "boulevard": "blvd", "crescent": "cres", "court": "ct", "lane": "ln"}
    words = re.sub(r"[^a-z0-9 ]", "", address.lower().split(",")[0]).split()
    return " ".join(suffixes.get(word, word) for word in words)


def read_rows(file):
    value = json.loads(file.read_bytes())
    return value if isinstance(value, list) else value.get("locations", value.get("sharedLocations", []))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--city", required=True)
    parser.add_argument("--base-id", action="append", required=True, help="Exact geo-data base ID; repeat for multiple stations")
    parser.add_argument("--training-file", type=Path, help="Defaults to the current city training file")
    parser.add_argument("--exclude-candidates", type=Path, action="append", default=[])
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--radius-metres", type=float, default=1500)
    parser.add_argument("--minimum-base-distance-metres", type=float, default=180)
    parser.add_argument("--distance-band-metres", type=float, default=300)
    parser.add_argument("--cell-metres", type=float, default=150)
    args = parser.parse_args()
    if not 1 <= args.limit <= 100 or args.radius_metres <= args.minimum_base_distance_metres or min(args.minimum_base_distance_metres, args.distance_band_metres, args.cell_metres) <= 0:
        parser.error("Use limit1–100 and positive, ordered distance bounds")
    sys.path.insert(0, str(args.cache / "deps"))
    from shapely.geometry import Point, shape
    geo = json.loads((args.repo / "cities" / args.city / "geo-data.json").read_bytes())
    training_file = args.training_file or args.repo / "cities" / args.city / "training-data.json"
    training_bytes = training_file.read_bytes()
    training = json.loads(training_bytes)
    bases = {base["id"]: base for base in geo["bases"]}
    if any(id not in bases for id in args.base_id):
        parser.error("Unknown exact base ID")
    profiles = {profile["baseId"]: profile for profile in training.get("routeResponses", {}).get("bases", [])}
    existing = training.get("sharedLocations", []) + geo.get("locations", []) + training.get("careHomes", [])
    for file in args.exclude_candidates:
        existing.extend(read_rows(file))
    excluded_ids = {row["id"] for row in existing}
    excluded_civics = {civic_key(row.get("address") or row.get("addr") or "") for row in existing}
    excluded_civics.update(civic_key(base["address"]) for base in bases.values())
    area_file = args.repo / "cities" / args.city / "response-areas.geojson"
    area_bytes = area_file.read_bytes() if area_file.exists() else None
    areas = json.loads(area_bytes)["features"] if area_bytes else []
    polygons = {}
    for id in args.base_id:
        base = bases[id]
        matching = [shape(feature["geometry"]) for feature in areas
                    if base["service"] == "fire" and str(feature["properties"].get("stationCode")) == str(base["number"])]
        if matching:
            polygons[id] = matching
    pools = {id: [] for id in args.base_id}
    civic_counts = Counter()
    source_file = args.cache / "bundles" / (args.city + ".jsonl")
    for line in source_file.open(encoding="utf-8"):
        row = json.loads(line)
        key = civic_key(row["address"])
        tags = row.get("tags", {})
        if row["id"] in excluded_ids or key in excluded_civics:
            continue
        if tags.get("building") == "construction" or any(name.startswith(("disused:", "abandoned:", "demolished:", "destroyed:", "construction:", "proposed:")) for name in tags):
            continue
        if any("conflict" in flag or "rejected" in flag for flag in row.get("reviewFlags", [])):
            continue
        matches = []
        for id in args.base_id:
            base = bases[id]
            distance = math.hypot((row["lat"] - base["lat"]) * 111195,
                                  (row["lng"] - base["lng"]) * 111195 * math.cos(math.radians(base["lat"])))
            if not args.minimum_base_distance_metres <= distance <= args.radius_metres:
                continue
            if id in polygons and not any(polygon.covers(Point(row["lng"], row["lat"])) for polygon in polygons[id]):
                continue
            matches.append((id, distance))
        if matches:
            civic_counts[key] += 1
        for id, distance in matches:
            pools[id].append((distance, row))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    metadata = json.loads((args.cache / "raw" / "source-metadata.json").read_bytes())
    reports = []
    for id, pool in pools.items():
        remaining = [(distance, row) for distance, row in pool if civic_counts[civic_key(row["address"])] == 1]
        unique_count = len(remaining)
        street_counts = Counter()
        cells = set()
        selected = []
        def cell(row):
            return (int(row["lat"] * 111195 / args.cell_metres),
                    int(row["lng"] * 111195 * math.cos(math.radians(row["lat"])) / args.cell_metres))
        while remaining and len(selected) < args.limit:
            remaining.sort(key=lambda pair: (int(pair[0] / args.distance_band_metres),
                           street_counts[pair[1]["tags"]["addr:street"]], cell(pair[1]) in cells,
                           not bool(pair[1]["tags"].get("name")), pair[0], pair[1]["id"]))
            distance, source = remaining.pop(0)
            row = copy.deepcopy(source)
            base = bases[id]
            canonical_id = base["service"] + "-" + id
            row["selectionPurpose"] = {
                "target": "Bounded complete-cache civic source-gap research",
                "targetBaseIds": [id], "targetCanonicalBaseId": canonical_id,
                "officialBaseAddress": base["address"], "officialBaseSource": base.get("sourceUrl"),
                "distanceToOfficialBaseMetres": round(distance, 1),
                "auditedBaseAccess": profiles.get(canonical_id, {}).get("access"),
                "insideOfficialFireRunArea": True if id in polygons else None,
                "sourceCivicHasSingleNearbyRecord": True,
                "assignmentOrDirectedReachabilityVerified": False,
                "selection": {"limit": args.limit, "radiusMetres": args.radius_metres,
                              "minimumBaseDistanceMetres": args.minimum_base_distance_metres,
                              "distanceBandMetres": args.distance_band_metres, "cellMetres": args.cell_metres},
            }
            selected.append(row)
            street_counts[row["tags"]["addr:street"]] += 1
            cells.add(cell(row))
        file = args.output_dir / (id + ".source-candidates.json")
        file.write_text(json.dumps({"schemaVersion": 1, "cityId": args.city, "source": metadata,
                                   "locations": selected}, indent=2) + "\n", encoding="utf-8")
        reports.append({"baseId": id, "nearbyNovelPool": len(pool), "uniqueCivicPool": unique_count,
                        "offered": len(selected), "filename": file.name, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()})
    report = {"stations": reports, "trainingSha256": hashlib.sha256(training_bytes).hexdigest(),
              "areaSha256": hashlib.sha256(area_bytes).hexdigest() if area_bytes else None,
              "limitations": ["Candidate mining only; unchanged canonical/route rules require independent verification",
                              "Current input snapshots/exclusions determine selection; not a reconstruction of historical reviewed bytes",
                              "No source point/civic/tags/geometry changes, PBF scan, download or production write"]}
    (args.output_dir / "mining-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    main()
