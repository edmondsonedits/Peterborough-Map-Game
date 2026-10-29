"""Export, verify and restore exact reviewed source bytes; combine non-Island inputs."""
import argparse
import gzip
import hashlib
import io
import json
from collections import Counter
from pathlib import Path

DEFAULT_ARCHIVE = Path(__file__).resolve().parent / "reviewed-targets"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def rows(value):
    result = value if isinstance(value, list) else value.get("locations", [])
    if not isinstance(result, list):
        raise ValueError("Source bundle must contain a locations array")
    return result


def deterministic_gzip(data):
    output = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0, compresslevel=9) as stream:
        stream.write(data)
    return output.getvalue()


def write_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def export(args):
    names = [file.name for file in args.input]
    if len(names) != len(set(names)):
        raise ValueError("Input basenames must be unique")
    args.archive_dir.mkdir(parents=True, exist_ok=True)
    entries = []
    for file in sorted(args.input, key=lambda file: file.name):
        original = file.read_bytes()
        value = json.loads(original)
        locations = rows(value)
        compressed = deterministic_gzip(original)
        assert gzip.decompress(compressed) == original
        source = value.get("source", {}) if isinstance(value, dict) else {}
        license_values = [row.get("provenance", {}).get("license") for row in locations]
        licenses = sorted({str(license) for license in license_values if license})
        entry = {
            "originalFilename": file.name,
            "archiveFilename": file.name + ".gz",
            "cityId": value.get("cityId") if isinstance(value, dict) else None,
            "candidateCount": len(locations),
            "uncompressedBytes": len(original),
            "uncompressedSha256": sha(original),
            "gzipBytes": len(compressed),
            "gzipSha256": sha(compressed),
            "license": source.get("license") or licenses,
            "candidateLicenses": licenses,
            "provenance": {
                key: source[key] for key in (
                    "sourceUrl", "sourcePage", "snapshotTimestamp", "retrievedAt",
                    "sha256", "licenseUrl", "attribution", "copyrightUrl"
                ) if key in source
            },
            "sourceGeometryQualityCounts": dict(sorted(Counter(
                row.get("sourceGeometryQuality", "unspecified") for row in locations
            ).items())),
        }
        (args.archive_dir / entry["archiveFilename"]).write_bytes(compressed)
        entries.append(entry)
    manifest = {
        "schemaVersion": 1,
        "reviewDate": args.review_date,
        "format": "gzip-compresslevel9-filename-empty-mtime0",
        "role": "Reviewed candidate evidence, not accepted locations or runtime calls",
        "sourceBytesPolicy": "Exact original bytes, including historical metadata; no JSON reformatting or field removal",
        "attribution": "© OpenStreetMap contributors",
        "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
        "limitations": [
            "Candidate inclusion is not canonical acceptance, operating-status verification, an entrance or route assignment",
            "Seven proposed isolated Island civic routes were rejected as disconnected or unreachable; no artificial connection was added",
            "Original Island source bytes must remain separate when the canonical builder checks its reviewed bundle SHA256",
        ],
        "bundles": entries,
    }
    write_json(args.archive_dir / "manifest.json", manifest)
    print(json.dumps(verify_archive(args.archive_dir), sort_keys=True))


def verify_archive(directory):
    manifest = json.loads((directory / "manifest.json").read_bytes())
    names = set()
    total = 0
    for entry in manifest["bundles"]:
        name = entry["archiveFilename"]
        if Path(name).name != name or name in names:
            raise ValueError("Unsafe or repeated archive filename")
        names.add(name)
        compressed = (directory / name).read_bytes()
        if len(compressed) != entry["gzipBytes"] or sha(compressed) != entry["gzipSha256"]:
            raise ValueError("Gzip checksum/size mismatch: " + name)
        if compressed[4:8] != b"\x00\x00\x00\x00":
            raise ValueError("Gzip mtime is not zero: " + name)
        original = gzip.decompress(compressed)
        if len(original) != entry["uncompressedBytes"] or sha(original) != entry["uncompressedSha256"]:
            raise ValueError("Restored checksum/size mismatch: " + name)
        if len(rows(json.loads(original))) != entry["candidateCount"]:
            raise ValueError("Candidate count mismatch: " + name)
        total += len(compressed)
    return {"pass": True, "bundles": len(names), "gzipBytes": total,
            "candidateRows": sum(entry["candidateCount"] for entry in manifest["bundles"])}


def restore(args):
    verify_archive(args.archive_dir)
    manifest = json.loads((args.archive_dir / "manifest.json").read_bytes())
    requested = set(args.bundle or [])
    entries = [entry for entry in manifest["bundles"] if not requested or entry["originalFilename"] in requested]
    if requested - {entry["originalFilename"] for entry in entries}:
        raise ValueError("Requested bundle is absent from manifest")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for entry in entries:
        name = entry["originalFilename"]
        if Path(name).name != name:
            raise ValueError("Unsafe restored filename")
        original = gzip.decompress((args.archive_dir / entry["archiveFilename"]).read_bytes())
        file = args.output_dir / name
        if file.exists() and file.read_bytes() != original and not args.force:
            raise ValueError("Refusing to replace different existing bytes: " + str(file))
        file.write_bytes(original)
        assert sha(file.read_bytes()) == entry["uncompressedSha256"]
    print(json.dumps({"pass": True, "restored": len(entries)}, sort_keys=True))


def combine(args):
    combined = {}
    source_files = []
    for file in args.input:
        data = file.read_bytes()
        source_files.append({"filename": file.name, "sha256": sha(data)})
        for row in rows(json.loads(data)):
            if row.get("cityId") != args.city:
                raise ValueError("Source-city mismatch: " + row.get("id", "unknown"))
            island = row.get("selectionPurpose", {}).get("target") == "Toronto Island source civic enrichment"
            if island:
                if args.exclude_island:
                    continue
                raise ValueError("Keep Island source bytes separate; use --exclude-island for mainland-only composition")
            previous = combined.get(row["id"])
            if previous is not None and previous != row:
                raise ValueError("Conflicting source records for ID: " + row["id"])
            combined[row["id"]] = row
    reference = None
    if args.current_training:
        data = args.current_training.read_bytes()
        current = {row["id"]: row for row in json.loads(data).get("sharedLocations", [])}
        matched = sorted(set(current) & set(combined))
        for id in matched:
            if any(current[id].get(key) != combined[id].get(key) for key in ("lat", "lng")):
                raise ValueError("Current canonical source-point conflict: " + id)
        reference = {"filename": args.current_training.name, "sha256": sha(data),
                     "canonicalRows": len(current), "matchingSourceIdsWithUnchangedPoints": matched,
                     "role": "Point-preservation check only; runtime records are not reconstructed as raw source geometry"}
    value = {"schemaVersion": 1, "cityId": args.city,
             "locations": [combined[id] for id in sorted(combined)],
             "sourceBundleReferences": source_files, "currentCanonicalReference": reference,
             "limitations": ["Derived non-Island composition, not byte-identical to any reviewed source bundle",
                             "Not an accepted catalogue or runtime call array; all canonical and route checks still apply"]}
    write_json(args.output, value)
    print(json.dumps({"pass": True, "candidateRows": len(combined), "sha256": sha(args.output.read_bytes())}, sort_keys=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("export", "verify", "restore"):
        sub = commands.add_parser(command)
        sub.add_argument("--archive-dir", type=Path, default=DEFAULT_ARCHIVE)
        if command == "export":
            sub.add_argument("--input", type=Path, action="append", required=True)
            sub.add_argument("--review-date", required=True)
            sub.set_defaults(run=export)
        elif command == "verify":
            sub.set_defaults(run=lambda args: print(json.dumps(verify_archive(args.archive_dir), sort_keys=True)))
        else:
            sub.add_argument("--output-dir", type=Path, required=True)
            sub.add_argument("--bundle", action="append")
            sub.add_argument("--force", action="store_true")
            sub.set_defaults(run=restore)
    sub = commands.add_parser("combine")
    sub.add_argument("--input", type=Path, action="append", required=True)
    sub.add_argument("--city", required=True)
    sub.add_argument("--output", type=Path, required=True)
    sub.add_argument("--current-training", type=Path)
    sub.add_argument("--exclude-island", action="store_true")
    sub.set_defaults(run=combine)
    args = parser.parse_args()
    try:
        args.run(args)
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
