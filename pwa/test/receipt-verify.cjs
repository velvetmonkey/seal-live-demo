// SPDX-License-Identifier: Apache-2.0
// Browser-compatible verifier harness over a real gateway-emitted receipt.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PWA = path.resolve(__dirname, "..");
const REPO = path.resolve(PWA, "..");
const WASM = path.join(PWA, "wasm");
const emit = spawnSync(process.execPath, ["-e", `
  const path=require("node:path");
  const {createDecider}=require("./seal-gateway/decide.cjs");
  (async()=>{const d=await createDecider(path.resolve(".seal/policy.json"));
    process.stdout.write(JSON.stringify(d.decide({operation:"insert",table:"staging_deploy_audit",payload:"{\\\"deploy_ref\\\":\\\"deploy-2026-06-30\\\"}"})));})();
`], { cwd: REPO, encoding: "utf8" });
if (emit.status !== 0) throw new Error(emit.stderr || `gateway producer exited ${emit.status}`);
const genuine = JSON.parse(emit.stdout);
const clone = () => structuredClone(genuine);
const flip = (s) => (s[0] === "0" ? "1" : "0") + s.slice(1);

globalThis.require = require;
globalThis.__dirname = WASM;
(0, eval)(fs.readFileSync(path.join(WASM, "seal.js"), "utf8"));
globalThis.window = globalThis;
globalThis.fetch = async (p) => {
  const bytes = fs.readFileSync(path.join(PWA, String(p)));
  return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};

(async () => {
  const { verifyReceipt, verificationPresentation } = await import(path.join(PWA, "receipt.js"));
  const { buildSignedConfig } = await import(path.join(PWA, "seal-config.js"));
  let ok = true;
  const check = (name, pass, detail = "") => {
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
    ok = ok && !!pass;
  };

  const wire = (receipt) => JSON.stringify(receipt);
  const authentic = await verifyReceipt(wire(clone()));
  const browserSigned = await buildSignedConfig(genuine.kernel_config);
  check("WebCrypto signer emits the exact RFC-key signed config",
    browserSigned.payload === genuine.signed_config.payload &&
    browserSigned.signature === genuine.signed_config.signature &&
    browserSigned.pubkey === genuine.signed_config.pubkey);
  const view = verificationPresentation(genuine, authentic);
  check("gateway receipt signature_valid", authentic.signature_valid === true);
  check("gateway receipt kernel_replay_consistent", authentic.kernel_replay_consistent === true);
  check("browser authority is UNPINNED", authentic.authority_trusted === "unpinned" && authentic.outcome === "unpinned");
  check("browser presentation is amber, never authorised-green",
    view.tone === "warn" && view.status === "UNPINNED" && view.summary.includes("authority NOT established"));
  check("freshness epoch surfaced without rollback claim",
    authentic.config_freshness?.value === 1 && authentic.config_freshness.rollback_enforced === false);

  const bundle = JSON.parse(fs.readFileSync(path.join(PWA, "bundle.json"), "utf8"));
  for (const key of ["p1", "p2"]) {
    const bundled = await verifyReceipt(wire(bundle.phases[key].receipt));
    check(`bundle ${key} authentic + replay-consistent + unpinned`,
      bundled.signature_valid && bundled.kernel_replay_consistent && bundled.outcome === "unpinned");
  }
  const bundledBypass = await verifyReceipt(wire(bundle.phases.p3.receipt));
  check("bundle p3 is NOT MEDIATED", !!bundledBypass.notMediated);

  const cases = [
    ["signature flip", (r) => { r.signed_config.signature = flip(r.signed_config.signature); }],
    ["payload flip", (r) => { r.signed_config.payload = r.signed_config.payload.replace('"epoch":1', '"epoch":2'); }],
    ["displayed config swap", (r) => { r.kernel_config.epoch = 2; }],
    ["policy hash swap", (r) => { r.approval.policy_hash = "0".repeat(64); }],
    ["verdict flip", (r) => { r.verdict = "BLOCK"; }],
    ["request hash flip", (r) => { r.canonical_request_sha256 = "0".repeat(64); }],
    ["emitted bytes flip", (r) => { r.emitted_bytes += " "; }],
    ["kernel hash flip", (r) => { r.kernel_identity.wasm_sha256 = "0".repeat(64); }],
    ["authority injection", (r) => { r.authority_trusted = true; }],
  ];
  for (const [name, mutate] of cases) {
    const receipt = clone(); mutate(receipt);
    const result = await verifyReceipt(wire(receipt));
    const rendered = verificationPresentation(receipt, result);
    check(`${name} fails red`, result.outcome === "failure" && rendered.tone === "bad");
  }

  const bypass = clone();
  for (const key of ["args_hash", "authorization", "approval", "emitted_bytes", "asserted_provenance", "signed_config", "kernel_config", "granted_capabilities", "policy_id"])
    delete bypass[key];
  bypass.bypass = true; bypass.verdict = "ALLOW"; bypass.certs = [];
  bypass.kernel_identity = { wasm_sha256: null, self_verified: false };
  bypass.reason = "seal bypassed"; bypass.deny_kernel = null;
  const bypassResult = await verifyReceipt(wire(bypass));
  const bypassView = verificationPresentation(bypass, bypassResult);
  check("bypass renders NOT MEDIATED", bypassResult.notMediated && bypassView.status === "NOT MEDIATED");

  process.exit(ok ? 0 : 1);
})().catch((error) => { console.error("ERR", error.message); process.exit(1); });
