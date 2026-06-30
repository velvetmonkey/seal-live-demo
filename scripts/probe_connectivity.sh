#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Runtime connectivity-proof: ASSERTS the topology rather than assuming it (hosted-
# runner docker networking is documented-flaky). Run from inside the AGENT container.
# Emits a JSON table and fails non-zero if the isolation invariants do not hold:
#   agent->gateway OK, agent->db FAIL, DATABASE_URL absent in agent env.
set -uo pipefail
GW="${MCP_HOST:-seal-gateway}"; GWP="${MCP_PORT:-8800}"
DBH="${DB_HOST:-target-db}"; DBP="${DB_PORT:-5432}"
probe() { timeout 3 bash -c "echo > /dev/tcp/$1/$2" 2>/dev/null && echo OK || echo FAIL; }
AG_GW=$(probe "$GW" "$GWP")
AG_DB=$(probe "$DBH" "$DBP")
HAS_DBURL=$([ -n "${DATABASE_URL:-}" ] && echo PRESENT || echo ABSENT)
printf '{"agent_to_gateway":"%s","agent_to_db":"%s","DATABASE_URL_in_agent":"%s"}\n' "$AG_GW" "$AG_DB" "$HAS_DBURL"
FAIL=0
[ "$AG_GW" = OK ]      || { echo "INVARIANT FAIL: agent cannot reach gateway" >&2; FAIL=1; }
[ "$AG_DB" = FAIL ]    || { echo "INVARIANT FAIL: agent CAN reach db (must not)" >&2; FAIL=1; }
[ "$HAS_DBURL" = ABSENT ] || { echo "INVARIANT FAIL: DATABASE_URL present in agent" >&2; FAIL=1; }
exit $FAIL
