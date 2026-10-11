#!/usr/bin/env python3
"""Read staged blobs; suppress only the three known build timestamp replacements.

No files, index entries or commits are reset by this classifier. Unknown changes
are substantive. Git/object read errors fail the step instead of skipping work.
"""
import argparse
from datetime import datetime
import json
from pathlib import Path
import re
import subprocess
import sys

JSON_PATHS = frozenset({'city-explorer/data/manifest.json', 'city-explorer/data/road-validation.json'})
REPORT_PATH = 'city-explorer/ROAD-VALIDATION.md'
TIMESTAMP = re.compile(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00\Z')


def valid_timestamp(value):
    if not isinstance(value, str) or not TIMESTAMP.fullmatch(value):
        return False
    try:
        datetime.fromisoformat(value)
        return True
    except ValueError:
        return False


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key')
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError(f'non-finite JSON constant: {value}')


def masked_json_timestamp(text):
    decoder = json.JSONDecoder(object_pairs_hook=unique_object, parse_constant=reject_constant)
    data = decoder.decode(text)
    if not isinstance(data, dict) or not valid_timestamp(data.get('generated_at')):
        raise ValueError('missing or invalid top-level generated_at timestamp')
    # Locate the validated TOP-LEVEL value token, preserving every other byte.
    # This deliberately treats reformatting/reordering as substantive too.
    position = len(text) - len(text.lstrip()) + 1
    while True:
        position = skip_space(text, position)
        key, position = decoder.raw_decode(text, position)
        position = skip_space(text, position)
        if text[position] != ':':
            raise ValueError('missing JSON colon')
        start = skip_space(text, position + 1)
        _, position = decoder.raw_decode(text, start)
        if key == 'generated_at':
            return text[:start] + '"<build timestamp>"' + text[position:], data[key]
        position = skip_space(text, position)
        if text[position] != ',':
            raise ValueError('missing timestamp token')
        position += 1


def skip_space(text, position):
    while position < len(text) and text[position] in ' \t\r\n':
        position += 1
    return position


def masked_report_timestamp(text):
    matches = list(re.finditer(r'^Generated: ([^\r\n]*)$', text, flags=re.MULTILINE))
    if len(matches) != 1 or not valid_timestamp(matches[0].group(1)):
        raise ValueError('expected one exact Generated timestamp line')
    match = matches[0]
    return text[:match.start(1)] + '<build timestamp>' + text[match.end(1):], match.group(1)


def timestamp_only(path, before, after):
    if path not in JSON_PATHS and path != REPORT_PATH:
        return False
    try:
        mask = masked_json_timestamp if path in JSON_PATHS else masked_report_timestamp
        old, old_value = mask(before.decode('utf-8'))
        new, new_value = mask(after.decode('utf-8'))
        return old_value != new_value and old == new
    except (ValueError, UnicodeError, IndexError, RecursionError):
        return False


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], stderr=subprocess.PIPE)


def classify(repo):
    raw = git(repo, 'diff', '--cached', '--raw', '-z', '--no-renames', '--no-abbrev', 'HEAD', '--')
    parts = raw.split(b'\0')
    if parts[-1] != b'' or (len(parts) - 1) % 2:
        raise ValueError('unexpected git raw diff format')
    files = []
    for index in range(0, len(parts) - 1, 2):
        old_mode, new_mode, old_id, new_id, status = parts[index].decode('ascii').lstrip(':').split()
        path = parts[index + 1].decode('utf-8', errors='surrogateescape')
        ignored = False
        if status == 'M' and old_mode == new_mode == '100644' and (path in JSON_PATHS or path == REPORT_PATH):
            ignored = timestamp_only(path, git(repo, 'cat-file', 'blob', old_id), git(repo, 'cat-file', 'blob', new_id))
        files.append({'path': path, 'status': status, 'timestamp_only': ignored})
    meaningful = any(not item['timestamp_only'] for item in files)
    return {'classification': 'substantive' if meaningful else 'timestamp-only' if files else 'unchanged',
            'meaningful_changes': meaningful, 'files': files}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--github-output', type=Path)
    args = parser.parse_args()
    try:
        report = classify(args.repo)
        print(json.dumps(report, indent=2, ensure_ascii=True))
        if args.github_output:
            with args.github_output.open('a', encoding='utf-8') as output:
                output.write('meaningful_changes=' + str(report['meaningful_changes']).lower() + '\n')
        return 0
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'Cannot classify staged generated assets: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
