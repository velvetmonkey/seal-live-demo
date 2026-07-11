#!/bin/bash
set -euo pipefail
ALLOWED="README.md FINDINGS.md scripts/showcase.sh scripts/capture_evidence.sh"
CHANGED=$(git diff main..HEAD --name-only || git diff --name-only HEAD~1..HEAD || echo '')
for f in $CHANGED; do
  ok=0
  for a in $ALLOWED; do
    if [[ "$f" == "$a" ]]; then ok=1; break; fi
  done
  if [[ $ok -eq 0 ]]; then
    echo "ERROR: $f not allowed in glowup diff"
    exit 1
  fi
done
echo "scope OK: only allowed files"
