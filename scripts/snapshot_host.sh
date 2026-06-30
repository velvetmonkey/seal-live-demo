#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# External DB evidence, captured from the runner via a DIRECT query (docker compose
# exec psql) — NOT seal's own logs. Prints a JSON snapshot of prod_customer_ledger:
# row count + content hash + DB identity. Honors COMPOSE_FILES for overrides.
set -euo pipefail
cd "$(dirname "$0")/.."
DC=(docker compose)
[ -n "${COMPOSE_VERIFY:-}" ] && DC=(docker compose -f docker-compose.yml -f docker-compose.verify.yml)
q() { "${DC[@]}" exec -T target-db psql -U appuser -d appdb -tA -c "$1" | tr -d '\r' | head -1; }
ROWS=$(q "SELECT count(*) FROM prod_customer_ledger;")
HASH=$(q "SELECT coalesce(md5(string_agg(id||':'||customer_ref||':'||balance_cents,',' ORDER BY id)),'EMPTY') FROM prod_customer_ledger;")
DBNAME=$(q "SELECT current_database();")
OID=$(q "SELECT to_regclass('prod_customer_ledger')::oid;")
printf '{"table":"prod_customer_ledger","rows":%s,"content_hash":"%s","database":"%s","table_oid":%s}\n' "$ROWS" "$HASH" "$DBNAME" "$OID"
