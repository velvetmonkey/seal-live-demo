// SPDX-License-Identifier: Apache-2.0
// §11.1 unparseable-request rule (normative: seal-host docs/DECISION-RECEIPT-SCHEMA.md,
// producer: seal-host main @ 3a74dbf) against BOTH in-repo copies of
// receipt-format.js (seal-gateway + pwa). Lines exist that the kernel mediates
// and serde cannot re-parse; their receipts carry request_sha256 +
// request_parse_error and omit the structured request fields.
//
// Run:  node test/receipt-format-unparseable.cjs
"use strict";
const path = require("path");

let failures = 0;
function check(name, got, want) {
  const pass = got === want;
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : `\n      got  ${got}\n      want ${want}`}`);
}

const UNP_FIELDS = {
  now: 1000,
  request_sha256: "c".repeat(64),
  request_parse_error: "cannot parse mediated request for receipt: number out of range at line 1 column 145",
  bypass: false, verdict: "BLOCK", reason: "safety kernel: cert", deny_kernel: "safety",
  certs: [], emitted_bytes: "{}",
  kernel_identity: { wasm_sha256: "0".repeat(64), self_verified: true },
  signed_config: { payload: "{\"epoch\":1}", signature: "a".repeat(128), pubkey: "b".repeat(64) },
  kernel_config: { epoch: 1 }, granted_capabilities: [],
};

(async () => {
  for (const copy of ["seal-gateway", "pwa"]) {
    const F = await import("file://" + path.resolve(__dirname, "..", copy, "receipt-format.js"));

    const asm = F.assembleReceiptV2({ ...UNP_FIELDS });
    check(`${copy}: assembleReceiptV2 preserves request_sha256 + request_parse_error (§11.5)`,
      JSON.stringify(Object.keys(asm)),
      JSON.stringify(["seal_receipt", "now", "request_sha256", "request_parse_error", "bypass",
        "verdict", "reason", "deny_kernel", "certs", "emitted_bytes", "kernel_identity",
        "signed_config", "kernel_config", "granted_capabilities"]));
    check(`${copy}: unparseable-request roundtrip byte-identical`,
      JSON.stringify(F.assembleReceiptV2(JSON.parse(JSON.stringify(asm)))), JSON.stringify(asm));

    const args = { operation: "insert", table: "t" };
    const withBoth = F.assembleReceiptV2({
      tool: "db.execute", arguments: args, now: 1000,
      canonical_request_sha256: F.canonicalRequestSha256("db.execute", args),
      request_sha256: "c".repeat(64),
      bypass: false, verdict: "BLOCK", reason: "r", deny_kernel: "safety",
      certs: [], emitted_bytes: "{}",
      kernel_identity: { wasm_sha256: "0".repeat(64), self_verified: true },
      signed_config: { payload: "{\"epoch\":1}", signature: "a".repeat(128), pubkey: "b".repeat(64) },
      kernel_config: { epoch: 1 }, granted_capabilities: [],
    });
    const keys = Object.keys(withBoth);
    check(`${copy}: request_sha256 sits between canonical_request_sha256 and bypass (§11.5 order)`,
      JSON.stringify(keys.slice(keys.indexOf("canonical_request_sha256"), keys.indexOf("bypass") + 1)),
      JSON.stringify(["canonical_request_sha256", "request_sha256", "bypass"]));
  }

  // --- §11.1/§11.2 unparseable-request rule: validation (both copies) --------
  for (const copy of ["seal-gateway", "pwa"]) {
    const F = await import("file://" + path.resolve(__dirname, "..", copy, "receipt-format.js"));
    const unp = F.assembleReceiptV2({ ...UNP_FIELDS });
    let v = F.validateReceipt(unp);
    check(`${copy}: unparseable-request receipt validates clean (§11.2)`,
      JSON.stringify([v.ok, v.version, v.errors]), JSON.stringify([true, "v2", []]));
    const current = { ...unp, record_type: "seal.authorization-decision", record_version: 2 };
    delete current.seal_receipt;
    v = F.validateReceipt(current);
    check(`${copy}: authorization-decision validates through v2`,
      JSON.stringify([v.ok, v.version, v.errors]), JSON.stringify([true, "v2", []]));
    v = F.validateReceipt({ ...current, request_sha256: "nothex" });
    check(`${copy}: authorization-decision retains v2 field checks`, v.ok, false);
    v = F.validateReceipt({ ...unp, record_type: "seal.authorization-decision", record_version: 2 });
    check(`${copy}: conflicting version-discriminator families are refused before classification`,
      v.errors.some((e) => e.includes("conflicting version discriminators: seal_receipt + record_type/record_version")), true);
    const duplicateDocument = JSON.stringify(unp).replace(
      '"seal_receipt":"v2"', '"seal_receipt":"v2","seal_receipt":"v2"');
    v = F.validateReceipt(duplicateDocument);
    check(`${copy}: duplicated discriminator in received document is refused`,
      v.document_checked === true && v.errors.some((e) => e.includes('version discriminator "seal_receipt" occurs 2 times')), true);
    for (const [k, vv] of [["tool", "db.execute"], ["arguments", {}],
      ["args_hash", "0".repeat(64)], ["canonical_request", "{}"],
      ["canonical_request_sha256", "0".repeat(64)]]) {
      v = F.validateReceipt({ ...unp, [k]: vv });
      check(`${copy}: unparseable + ${k} rejected (fabrication)`, v.ok, false);
    }
    v = F.validateReceipt({ ...unp, request_sha256: "nothex" });
    check(`${copy}: unparseable non-hex request_sha256 rejected`, v.ok, false);
    const noRaw = { ...unp }; delete noRaw.request_sha256;
    v = F.validateReceipt(noRaw);
    check(`${copy}: unparseable without request_sha256 rejected`, v.ok, false);
    v = F.validateReceipt({ ...unp, bypass: true });
    check(`${copy}: bypass + request_parse_error rejected (mediated receipts only)`,
      v.errors.some((e) => e.includes("only a mediated receipt")), true);
  }

  // --- pwa presentation: the reduced-scope state is its own banner ------------
  const RP = await import("file://" + path.resolve(__dirname, "..", "pwa", "receipt.js"));
  const pres = RP.verificationPresentation({}, { unparseableRequest: true, verificationCore: true, outcome: "unpinned" });
  check("pwa: unparseable presentation names the raw-line-identity state",
    pres.status, "RAW-LINE IDENTITY ONLY");
  const presFail = RP.verificationPresentation({}, { unparseableRequest: true, verificationCore: false, outcome: "failure" });
  check("pwa: failed unparseable receipt still presents as FAILED", presFail.status, "FAILED");

  console.log(failures === 0 ? "\nALL CHECKS PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
