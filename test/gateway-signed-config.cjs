// SPDX-License-Identifier: Apache-2.0
// Gateway-only adversarial checks for pinned-kernel (0b5e7925) signed-config production.
const path = require("node:path");
const crypto = require("node:crypto");
const { createDecider } = require("../seal-gateway/decide.cjs");

const ROOT = path.resolve(__dirname, "..");
const POLICY = path.join(ROOT, ".seal", "policy.json");
const WASM = path.join(ROOT, "seal-gateway", "wasm");
let ok = true;
const check = (name, pass, detail = "") => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  ok = ok && !!pass;
};
const flip = (s) => (s[0] === "0" ? "1" : "0") + s.slice(1);

(async () => {
  const d = await createDecider(POLICY);
  const rf = await import(path.join(ROOT, "seal-gateway", "receipt-format.js"));
  const receipt = d.decide({ operation: "insert", table: "staging_deploy_audit",
    payload: '{"deploy_ref":"deploy-2026-06-30"}' });
  const bypass = d.decide({ operation: "delete_all", table: "prod_customer_ledger", payload: "{}" }, { bypass: true });

  check("mediated receipt validates", rf.validateReceipt(receipt).ok);
  check("bypass validates without signed_config", rf.validateReceipt(bypass).ok);
  check("signed payload byte-equals displayed config",
    receipt.signed_config.payload === JSON.stringify(receipt.kernel_config));
  check("outer legacy receipt signature absent", !("signature" in receipt) && !("signature" in bypass));

  const pub = crypto.createPublicKey({
    key: Buffer.from("302a300506032b6570032100" + receipt.signed_config.pubkey, "hex"),
    format: "der", type: "spki",
  });
  check("Node verifies emitted Ed25519 signature", crypto.verify(null,
    Buffer.from(receipt.signed_config.payload), pub,
    Buffer.from(receipt.signed_config.signature, "hex")));
  check("signature flip fails Ed25519", !crypto.verify(null,
    Buffer.from(receipt.signed_config.payload), pub,
    Buffer.from(flip(receipt.signed_config.signature), "hex")));
  check("payload flip fails Ed25519", !crypto.verify(null,
    Buffer.from(receipt.signed_config.payload.replace('"epoch":1', '"epoch":2')), pub,
    Buffer.from(receipt.signed_config.signature, "hex")));

  globalThis.require = require;
  globalThis.__dirname = WASM;
  const M = await globalThis.SealModule({ locateFile: (p) => path.join(WASM, p), print() {}, printErr() {} });
  const init = (payload, signature) => JSON.parse(M.ccall("seal_init", "string", ["string", "string"],
    [JSON.stringify({ payload, signature }), receipt.signed_config.pubkey]));
  check("pinned kernel accepts emitted signed_config", init(receipt.signed_config.payload, receipt.signed_config.signature).ok === true);
  check("pinned kernel rejects signature flip", init(receipt.signed_config.payload, flip(receipt.signed_config.signature)).ok !== true);
  check("pinned kernel rejects payload flip", init(
    receipt.signed_config.payload.replace('"epoch":1', '"epoch":2'), receipt.signed_config.signature).ok !== true);

  const missing = structuredClone(receipt); delete missing.signed_config;
  check("mediated missing signed_config rejected", !rf.validateReceipt(missing).ok);
  const swapped = structuredClone(receipt); swapped.kernel_config.epoch = 2;
  check("displayed config swap rejected", !rf.validateReceipt(swapped).ok);
  const injected = structuredClone(receipt); injected.authority_trusted = true;
  check("receipt-supplied authority rejected", !rf.validateReceipt(injected).ok);
  const signedBypass = structuredClone(bypass); signedBypass.signed_config = receipt.signed_config;
  check("signed_config forbidden on bypass", !rf.validateReceipt(signedBypass).ok);

  process.exit(ok ? 0 : 1);
})().catch((error) => { console.error("ERR", error.message); process.exit(1); });
