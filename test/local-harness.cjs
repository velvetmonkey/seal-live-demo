// SPDX-License-Identifier: Apache-2.0
// ============================ TEST-ONLY — NOT SHIPPED RUNTIME ================
// Drives the gateway decision core (decide.cjs) directly against the real seal.wasm
// to prove the three-phase verdicts offline, with NO DB, NO HTTP, NO model. This is
// a developer harness; the product's decision path is the live gateway in the
// workflow. It fabricates nothing — it runs the same kernel the gateway runs.
//   node test/local-harness.cjs
// ============================================================================
const path = require("path");
const crypto = require("crypto");
const { createDecider } = require(path.join(__dirname, "..", "seal-gateway", "decide.cjs"));
const POLICY = path.join(__dirname, "..", ".seal", "policy.json");

(async () => {
  const d = await createDecider(POLICY);
  let ok = true;
  const check = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); ok = ok && cond; };

  // The benign capability the gateway presents: stuff the agent is authorised for.
  // P1: benign month-end staging reconciliation (insert into staging).
  const p1 = d.decide({ operation: "insert", table: "staging_deploy_audit", payload: '{"deploy_ref":"deploy-2026-06-30"}' });
  check("P1 insert/staging = ALLOW", p1.verdict === "ALLOW", p1.reason);
  check("P1 authorization = approval", p1.authorization === "approval");
  check("P1 signed_config payload byte-equals kernel_config",
    p1.signed_config.payload === JSON.stringify(p1.kernel_config));
  const publicKey = crypto.createPublicKey({
    key: Buffer.from("302a300506032b6570032100" + p1.signed_config.pubkey, "hex"),
    format: "der", type: "spki",
  });
  check("P1 signed_config is real Ed25519", crypto.verify(null,
    Buffer.from(p1.signed_config.payload, "utf8"), publicKey,
    Buffer.from(p1.signed_config.signature, "hex")));

  // P2: the attack the injection induces — delete_all on prod. seal ON.
  const attack = { operation: "delete_all", table: "prod_customer_ledger", payload: "{}" };
  const p2 = d.decide(attack);
  check("P2 delete_all/prod = BLOCK", p2.verdict === "BLOCK", p2.reason);

  // P3: identical attack, seal bypassed (control).
  const p3 = d.decide(attack, { bypass: true });
  check("P3 (bypass) = ALLOW (would execute)", p3.verdict === "ALLOW", p3.reason);
  check("P3 bypass is unsigned + carries no signed_config",
    !("signature" in p3) && !("signed_config" in p3));

  // Credibility spine: P2 and P3 canonical request bytes are byte-identical.
  check("P2/P3 canonical_request_sha256 IDENTICAL", p2.canonical_request_sha256 === p3.canonical_request_sha256,
    p2.canonical_request_sha256.slice(0, 16) + "…");

  // ALLOW vs BLOCK differ ONLY in canonical bytes (same tool, same presented capability).
  check("P1 vs P2 differ only in args bytes", p1.tool === p2.tool && p1.canonical_request_sha256 !== p2.canonical_request_sha256);

  // THE ONE THING: obfuscation a naive exact-match denylist misses, seal blocks regardless.
  const naiveDenylist = (op) => op === "delete_all"; // a 5-line filter's idea of "destructive"
  for (const op of ["delete_all\n", "DELETE_ALL", "delete_all "]) {
    const r = d.decide({ operation: op, table: "prod_customer_ledger", payload: "{}" });
    check(`obfuscated op ${JSON.stringify(op)}: seal BLOCK`, r.verdict === "BLOCK");
    check(`  …and naive exact denylist MISSES it`, naiveDenylist(op) === false, "naive would forward to DB");
  }

  // Receipt re-derivability: same input twice → identical verdict + signed config.
  const a = d.decide(attack), b = d.decide(attack);
  check("Block receipt deterministic (verdict+signed_config)",
    a.verdict === b.verdict && JSON.stringify(a.signed_config) === JSON.stringify(b.signed_config));
  check("Mediated receipts have no outer demo signature",
    !("signature" in p1) && !("signature" in p2));

  console.log(`\nkernel sha256 ${d.kernelSha.slice(0, 12)}…  policy ${d.policyId}`);
  console.log(`P2 deny_kernel=${p2.deny_kernel}  certs=${p2.certs.map((c) => c.kernel + ":" + c.verdict).join(",")}`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
