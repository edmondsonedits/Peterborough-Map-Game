"""Build small, deterministic photo patches from owner footage without editing sources."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = ROOT / "city-explorer/assets/recording-frontages"
RECIPE_FILE = ASSET_DIR / "recipes.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def perspective_coefficients(quad, size):
    width, height = size
    target = [(0, 0), (width, 0), (width, height), (0, height)]
    rows, rhs = [], []
    for (x, y), (u, v) in zip(target, quad):
        rows.extend(([x, y, 1, 0, 0, 0, -u * x, -u * y],
                     [0, 0, 0, x, y, 1, -v * x, -v * y]))
        rhs.extend((u, v))
    return np.linalg.solve(np.asarray(rows, dtype=np.float64), np.asarray(rhs, dtype=np.float64))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--references", type=Path, required=True, help="Reference catalog root under H:/ChatGPT")
    args = parser.parse_args()
    ref_root = args.references.resolve()
    expected_root = Path("H:/ChatGPT/Peterborough-Building-References-20261024").resolve()
    if ref_root != expected_root:
        raise SystemExit(f"Reference catalog must be the authorized H:/ChatGPT source root: {expected_root}")
    config = json.loads(RECIPE_FILE.read_text(encoding="utf-8"))
    records = []
    for recipe in config["recipes"]:
        source = ref_root / recipe["source"]
        if not source.is_file():
            raise FileNotFoundError(f"Missing reference source: {source}")
        image = Image.open(source).convert("RGB")
        width, height = recipe["size"]
        quad = recipe["quad"]
        if len(quad) != 4 or any(len(point) != 2 for point in quad):
            raise ValueError(f"{recipe['id']} requires four ordered source points")
        if any(not (0 <= x < image.width and 0 <= y < image.height) for x, y in quad):
            raise ValueError(f"Crop points leave the source image for {recipe['id']}")
        coeff = perspective_coefficients(quad, (width, height))
        patch = image.transform((width, height), Image.Transform.PERSPECTIVE, coeff,
                                Image.Resampling.BICUBIC)
        target = ASSET_DIR / recipe["file"]
        patch.save(target, format="JPEG", quality=recipe["quality"], optimize=True,
                   progressive=True, subsampling=0)
        records.append({
            **recipe,
            "sourcePath": f"{config['referenceRoot']}/{recipe['source']}",
            "sourceSha256": sha256(source),
            "sourceDimensions": list(image.size),
            "sha256": sha256(target),
            "dimensions": [width, height],
            "bytes": target.stat().st_size,
            "mipEstimateBytes": (width * height * 4 * 4 + 2) // 3,
            "preparation": "Pillow perspective homography with bicubic resampling; JPEG export; no synthetic fill or source edits",
            "provenance": "User-provided vehicle recording. This records source and derivation, not a generic copyright licence."
        })

    review_records = []
    for review in config.get("candidateReviews", []):
        source = ref_root / review["source"]
        review_records.append({
            **review,
            "sourcePath": f"{config['referenceRoot']}/{review['source']}",
            "sourceSha256": sha256(source) if source.is_file() else None,
            "sourceAvailable": source.is_file(),
        })

    total_bytes = sum(record["bytes"] for record in records)
    total_mip_bytes = sum(record["mipEstimateBytes"] for record in records)
    manifest = {
        "schemaVersion": 1,
        "referenceRoot": config["referenceRoot"],
        "recording": "VID_20261018_073202_00_001.insv",
        "recordingSource": "User-provided recording; camera calibration remains experimental.",
        "records": records,
        "candidateReviews": review_records,
        "totalBytes": total_bytes,
        "decodedTextureBytesWithMipmaps": total_mip_bytes,
        "limits": {"encodedBytes": 1048576, "decodedTextureBytesWithMipmaps": 12582912, "longestSide": 1024},
    }
    (ASSET_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    if total_bytes > manifest["limits"]["encodedBytes"] or total_mip_bytes > manifest["limits"]["decodedTextureBytesWithMipmaps"]:
        raise SystemExit("Recording facade photo budget exceeded")
    if any(max(*record["dimensions"]) > manifest["limits"]["longestSide"] for record in records):
        raise SystemExit("Recording facade photo dimension limit exceeded")
    print(json.dumps({"textures": len(records), "encodedBytes": total_bytes,
                      "decodedWithMipmapsBytes": total_mip_bytes}, separators=(",", ":")))


if __name__ == "__main__":
    main()
