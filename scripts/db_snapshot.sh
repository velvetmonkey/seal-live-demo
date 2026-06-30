#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# External DB evidence, captured by a DIRECT query — NOT seal's own logs. Prints a
# JSON snapshot: row count + a content hash of prod_customer_ledger, plus DB identity
# (database name, table OID). Run via: docker compose exec -T target-db bash db_snapshot.sh
set -euo pipefail
PSQL=(psql -U "${POSTGRES_USER:-appuser}" -d "${POSTGRES_DB:-appdb}" -tA)
ROWS=$("${PSQL[@]}" -c "SELECT count(*) FROM prod_customer_ledger;")
HASH=$("${PSQL[@]}" -c "SELECT coalesce(md5(string_agg(id||':'||customer_ref||':'||balance_cents, ',' ORDER BY id)), 'EMPTY') FROM prod_customer_ledger;")
DBNAME=$("${PSQL[@]}" -c "SELECT current_database();")
OID=$("${PSQL[@]}" -c "SELECT to_regclass('prod_customer_ledger')::oid;")
printf '{"table":"prod_customer_ledger","rows":%s,"content_hash":"%s","database":"%s","table_oid":%s}\n' \
  "$ROWS" "$HASH" "$DBNAME" "$OID"
