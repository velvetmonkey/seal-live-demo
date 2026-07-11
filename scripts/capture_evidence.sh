#!/bin/bash
# Per-repo capture_evidence.sh - sole writer for this branch.
# Runs the exact command from README luxury section, tees raw output.
# Asserts clean tree.
set -euo pipefail

REPO="seal-live-demo"
SCRATCH="${SCRATCH:-/tmp/grok-goal-812b560f73c6/implementer}"
mkdir -p "$SCRATCH"

BRANCH_LOG="$SCRATCH/${REPO}-branch.log"
DEMO_LOG="$SCRATCH/${REPO}-demo.log"

echo "=== capture_evidence for $REPO ==="

# Assert clean checkout
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree not clean"
  git status --porcelain
  exit 1
fi

# Branch info
{
  echo "BRANCH:"
  git branch --show-current
  echo "PORCELAIN:"
  git status --porcelain
  echo "PORCELAIN_END"
  echo "COMMIT_LOG:"
  git log --oneline -3
  echo "TIP_STAT:"
  git show --stat HEAD
} > "$BRANCH_LOG"

# The exact command from README luxury section
CMD="bash scripts/showcase.sh"

echo "RUNNING: $CMD"
# Run and tee raw
if timeout 180s bash -c "$CMD" > >(tee -a "$DEMO_LOG") 2>&1 ; then
  echo "=== capture succeeded ==="
  exit 0
else
  echo "=== capture failed (exit $?) ==="
  exit 1
fi
