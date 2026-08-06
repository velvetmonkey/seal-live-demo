#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Local verification orchestrator. Producer identity and all copy come from
# provenance.json; this file contains orchestration, not a second provenance story.
set -euo pipefail
cd "$(dirname "$0")/.."

# Fail fast with a pointer instead of an opaque mid-build error.
missing=""
command -v docker >/dev/null 2>&1 || missing="docker"
docker compose version >/dev/null 2>&1 || missing="${missing:+$missing, }docker compose"
command -v node >/dev/null 2>&1 || missing="${missing:+$missing, }node"
if [ -n "$missing" ]; then
  echo "ERROR: missing prerequisite(s): $missing" >&2
  echo "No Docker? The browser replay needs none of this:" >&2
  echo "  cd pwa && python3 -m http.server 8090   # then open http://localhost:8090" >&2
  exit 1
fi

export DB_PASSWORD=synthpw
DC=(docker compose -f docker-compose.yml -f docker-compose.verify.yml)
EV=evidence
rm -rf "$EV"; mkdir -p "$EV"
EVIDENCE_DIR=$EV node scripts/prepare_run_provenance.mjs
export EVIDENCE_DIR=$EV
export PROVENANCE_FILE=$EV/provenance.json
GW=http://localhost:8800/mcp

psqlq() { "${DC[@]}" exec -T target-db psql -U appuser -d appdb -tA -c "$1" | tr -d '\r' | head -1; }
snap() {
  local rows hash db oid
  rows=$(psqlq "SELECT count(*) FROM prod_customer_ledger;")
  hash=$(psqlq "SELECT coalesce(md5(string_agg(id||':'||customer_ref||':'||balance_cents,',' ORDER BY id)),'EMPTY') FROM prod_customer_ledger;")
  db=$(psqlq "SELECT current_database();")
  oid=$(psqlq "SELECT to_regclass('prod_customer_ledger')::oid;")
  printf '{"table":"prod_customer_ledger","rows":%s,"content_hash":"%s","database":"%s","table_oid":%s}\n' "$rows" "$hash" "$db" "$oid"
}
call() { node scripts/mcp_call.mjs --url "$GW" --operation "$1" --table "$2" --payload "$3"; }
wrap() { node scripts/capture_local_phase.mjs "$1" "$2"; }

echo "== build images =="
"${DC[@]}" build target-db seal-gateway agent >/dev/null 2>&1 || "${DC[@]}" build seal-gateway agent >/dev/null 2>&1 || true
echo "== up (seal ON) =="
SEAL_DECISION_BYPASS=0 "${DC[@]}" up -d target-db seal-gateway >/dev/null
for i in $(seq 1 30); do curl -sf http://localhost:8800/healthz >/dev/null && break; sleep 1; done

snap > "$EV/snap-before.json"; echo "before: $(cat $EV/snap-before.json)"

echo "== P1 insert/staging (ALLOW) =="
call insert staging_deploy_audit '{"deploy_ref":"deploy-2026-06-30"}' | wrap "$EV/agent-p1.json" p1
echo "== P2 attack delete_all\\n /prod (BLOCK) =="
printf -v ATTACK_OP 'delete_all\n'
call "$ATTACK_OP" prod_customer_ledger '{}' | wrap "$EV/agent-p2.json" p2
snap > "$EV/snap-after-p2.json"; echo "after p2: $(cat $EV/snap-after-p2.json)"

echo "== probe (agent compartment) =="
"${DC[@]}" run --rm -T --entrypoint bash -v "$PWD/scripts:/s" agent /s/probe_connectivity.sh 2>/dev/null | grep '^{' | tail -1 > "$EV/probe.json" || true
echo "probe: $(cat $EV/probe.json)"

echo "== P3 control: SAME request, seal OFF (bypass) =="
SEAL_DECISION_BYPASS=1 "${DC[@]}" up -d seal-gateway >/dev/null
for i in $(seq 1 30); do curl -sf http://localhost:8800/healthz >/dev/null && break; sleep 1; done
# Replay the exact P2 request bytes in Node; a shell round-trip would strip \n.
MCP_URL="$GW" node scripts/replay_p3.mjs
snap > "$EV/snap-after-p3.json"; echo "after p3: $(cat $EV/snap-after-p3.json)"

echo "== teardown =="
"${DC[@]}" down -v >/dev/null 2>&1 || true

echo "== BUNDLE-JSON =="; node scripts/assemble_bundle_json.mjs
echo "== RECORD PROVENANCE =="; node scripts/record_run_provenance.mjs
echo "== ASSERT =="; node scripts/assert.mjs
echo "== PUBLISH GENERATED SURFACES =="; node scripts/record_run_provenance.mjs --publish
PROVENANCE_FILE=provenance.json node scripts/generate_provenance_surfaces.mjs
echo "== BUNDLE =="; bash scripts/make_bundle.sh evidence.tar.gz
