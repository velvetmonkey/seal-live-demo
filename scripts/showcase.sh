#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec timeout 180s bash scripts/run_local.sh 2>&1 || exec echo "run_local.sh failed or no docker (see captured stdout and assets in evidence/)"
