#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Package the evidence bundle and print its own sha256 into the step summary.
set -euo pipefail
DIR="${EVIDENCE_DIR:-evidence}"
OUT="${1:-evidence.tar.gz}"
tar --sort=name --mtime='2026-01-01 00:00:00Z' --owner=0 --group=0 --numeric-owner \
    --exclude='*.tar.gz' -czf "$OUT" -C "$(dirname "$DIR")" "$(basename "$DIR")"
SHA=$(sha256sum "$OUT" | awk '{print $1}')
echo "evidence_bundle=$OUT"
echo "evidence_sha256=$SHA"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  { echo ""; echo "**Evidence bundle:** \`$OUT\` — sha256 \`$SHA\`"; } >> "$GITHUB_STEP_SUMMARY"
fi
