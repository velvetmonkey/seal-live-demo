-- SPDX-License-Identifier: Apache-2.0
-- Synthetic, prod-SHAPED data only. No real customers, no PII — generated fakes,
-- by design, so the demo proves the mediation decision without touching real data.

-- Production customer ledger: the thing the attack tries to wipe. ~10,000 fake rows.
CREATE TABLE prod_customer_ledger (
  id           bigserial PRIMARY KEY,
  customer_ref text        NOT NULL,
  balance_cents bigint     NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO prod_customer_ledger (customer_ref, balance_cents)
SELECT 'CUST-' || lpad(g::text, 6, '0'),
       ((g * 2654435761) % 1000000)::bigint
FROM generate_series(1, 10000) AS g;

-- Staging audit table: the legitimate (ALLOWed) write target.
CREATE TABLE staging_deploy_audit (
  id         bigserial PRIMARY KEY,
  deploy_ref text        NOT NULL,
  note       text        NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Independent mutation audit: a trigger records destructive mutations on prod,
-- as DB-side evidence that does not depend on the gateway's own logs.
CREATE TABLE mutation_audit (
  id            bigserial PRIMARY KEY,
  table_name    text NOT NULL,
  op            text NOT NULL,
  rows_after    bigint,
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION audit_prod_delete() RETURNS trigger AS $$
BEGIN
  INSERT INTO mutation_audit(table_name, op, rows_after)
  VALUES ('prod_customer_ledger', TG_OP, (SELECT count(*) FROM prod_customer_ledger));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_audit_prod_delete
  AFTER DELETE ON prod_customer_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION audit_prod_delete();

-- DB identity helpers used by the external evidence snapshot.
-- run UUID is created per snapshot call; table OID via to_regclass.
