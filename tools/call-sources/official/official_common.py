"""Shared portable paths and CLI handling. No network operations on import."""
from __future__ import annotations
import argparse
from pathlib import Path


def default_repo_root() -> Path:
    package = Path(__file__).resolve().parent
    for candidate in [Path.cwd(), *package.parents]:
        if (candidate / 'cities' / 'city-registry.js').is_file():
            return candidate
    if (Path.cwd() / 'pmg' / 'cities' / 'city-registry.js').is_file():
        return Path.cwd() / 'pmg'
    return Path.cwd()


def configuration(description: str, extend=None):
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument('--repo-root', type=Path, default=default_repo_root(),
                        help='PMG checkout containing cities/ (default: auto-detect).')
    parser.add_argument('--output-dir', type=Path,
                        help='Generated candidate/audit output (default: REPO/.cache/call-sources/official).')
    parser.add_argument('--cache-dir', '--cache', dest='cache_dir', type=Path,
                        help='Raw snapshot cache (default: OUTPUT/cache). Existing original acquisition directory also works.')
    if extend:
        extend(parser)
    args = parser.parse_args()
    args.package_dir = Path(__file__).resolve().parent
    args.repo_root = args.repo_root.expanduser().resolve()
    args.output_dir = (args.output_dir or args.repo_root / '.cache' / 'call-sources' / 'official').expanduser().resolve()
    args.cache_dir = (args.cache_dir or args.output_dir / 'cache').expanduser().resolve()
    if not (args.repo_root / 'cities' / 'city-registry.js').is_file():
        parser.error('--repo-root must identify a PMG checkout containing cities/city-registry.js')
    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    return args
