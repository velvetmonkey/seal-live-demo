#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  bash scripts/run_local.sh
else
  echo 'No Docker; fallback PWA replay showcase'
  cd pwa
  python3 -m http.server 8090 >/dev/null 2>&1 & SRV=$!
  sleep 1
  curl -s --max-time 3 http://localhost:8090 | head -c 400 || true
  kill $SRV 2>/dev/null || true
  echo 'Evidence shows block vs bypass (see evidence/summary.md)'
fi
