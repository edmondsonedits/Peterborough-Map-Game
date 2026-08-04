#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
for file in gta-fire-response/src/*.js gta-fire-response/leaflet-fallback.js; do node --check "$file"; done
python tests/gta-fire-response/validate-static.py
node --test tests/gta-fire-response/phase1-core.test.mjs tests/gta-fire-response/phase2-core.test.mjs tests/gta-fire-response/phase3-core.test.mjs
python -m http.server 4173 >/tmp/pfr-phase3-http.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
for attempt in {1..20}; do
  if curl -fsS 'http://127.0.0.1:4173/gta-fire-response/?test=1&call=alarm' | grep -q 'Peterborough Fire Response'; then break; fi
  if [[ "$attempt" == 20 ]]; then echo 'HTTP smoke: FAIL' >&2; exit 1; fi
  sleep .15
done
echo 'HTTP smoke: PASS'
