"""Acquire the pinned, licensed source snapshot without redundant downloads.

Mutable upstream URLs can change. A changed checksum fails closed: review a new
snapshot manifest explicitly instead of silently relabelling changed data.
"""
from __future__ import annotations
import hashlib
import json
import shutil
import urllib.request
import zipfile
import zlib
from pathlib import Path
from official_common import configuration


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def matches(path: Path, row: dict) -> bool:
    return path.is_file() and path.stat().st_size == row['size'] and sha256(path) == row['sha256']


def arguments(parser):
    parser.add_argument('--group', choices=['all', 'lode', 'schools', 'additional'], default='all')
    parser.add_argument('--offline', action='store_true', help='Verify cache only; never make a network request.')


def main(default_group=None):
    cfg = configuration('Fetch or verify the frozen 2026-10-29 official source snapshot.', arguments)
    group = default_group or cfg.group
    manifest = json.loads((cfg.package_dir / 'source-resources.json').read_text())
    selected = [row for row in manifest['resources'] if group == 'all' or row['group'] == group]
    for row in selected:
        destination = cfg.cache_dir / row['filename']
        if matches(destination, row):
            print(f"cache verified: {row['filename']}")
            continue
        bundled = cfg.package_dir / row['filename']
        if row.get('bundledSnapshot') and matches(bundled, row):
            shutil.copyfile(bundled, destination)
            print(f"bundled snapshot verified: {row['filename']}")
            continue
        if cfg.offline:
            raise SystemExit(f"Missing or mismatched cache file: {destination}. Run without --offline to fetch the pinned bytes.")
        temporary = destination.with_suffix(destination.suffix + '.partial')
        try:
            with urllib.request.urlopen(row['downloadUrl'], timeout=180) as response, temporary.open('wb') as output:
                shutil.copyfileobj(response, output, 1024 * 1024)
            if not matches(temporary, row):
                raise SystemExit(f"Snapshot checksum/size mismatch for {row['filename']}; upstream may have changed. Review a new manifest. Cache not replaced.")
            temporary.replace(destination)
            print(f"download verified: {row['filename']}")
        finally:
            temporary.unlink(missing_ok=True)
    if group in ['all', 'lode']:
        # Extract only the two known files used by normalization, never arbitrary ZIP paths.
        archive = cfg.cache_dir / 'odsrf_v2_gpkg.zip'
        target = cfg.cache_dir / 'odsrf'
        target.mkdir(exist_ok=True)
        with zipfile.ZipFile(archive) as package:
            for filename in ['odsrf_v2.gpkg', 'odsrf_v2_data_sources.csv']:
                info = package.getinfo(filename)
                destination = target / filename
                if destination.exists() and destination.stat().st_size == info.file_size:
                    crc = 0
                    with destination.open('rb') as existing:
                        for chunk in iter(lambda: existing.read(1024 * 1024), b''):
                            crc = zlib.crc32(chunk, crc)
                    if crc == info.CRC:
                        continue
                with package.open(info) as source, destination.open('wb') as output:
                    shutil.copyfileobj(source, output, 1024 * 1024)
    audit = {'snapshotId': manifest['snapshotId'], 'group': group,
             'resources': [{'filename': row['filename'], 'sha256': row['sha256'], 'size': row['size']} for row in selected]}
    (cfg.output_dir / f'acquisition-verification-{group}.json').write_text(json.dumps(audit, indent=2) + '\n')


if __name__ == '__main__':
    main()
