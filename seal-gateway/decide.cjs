// SPDX-License-Identifier: Apache-2.0
// seal-gateway decision core. Loads the compiled black-box seal kernel (the SAME
// audited seal-check wasm, sha256 ebd17c14…) in Node via its emscripten glue, and
// decides one db.execute tool-call against the capability policy.
//
// There is NO kernel logic here. seal.wasm is the verified mediation DECISION
// FUNCTION; this host only: builds the canonical request, presents the agent's
// granted capabilities, calls seal_init/seal_decide, and shapes a re-derivable
// receipt. The host/transport/container wiring is NOT verified (see AUDIT.md / README
// honesty panel).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const WASM_DIR = path.join(ROOT, "wasm");
const KERNEL_WASM_SHA256 = "ebd17c14668176612c49f6e2940b23df82a2c1a7cdef6759f0d6276ae997e9d0";
const LEAN_TOOLCHAIN = "leanprover/lean4:v4.28.0";
const KERNEL_AXIOMS = ["propext", "Classical.choice", "Quot.sound"];
// Demo signing key — integrity check ONLY, NOT a production identity (honesty rule).
const DEMO_KEY = "seal-live-demo-demo-key-v0";

// Load the emscripten glue once to obtain the global SealModule factory. The glue is
// a classic-script MODULARIZE build that exports nothing under Node, so it is eval'd
// in global scope after shimming the Node-branch globals (require, __dirname). It
// loads only the project's own public artifact.
let _modPromise = null;
function loadModule() {
  if (_modPromise) return _modPromise;
  globalThis.require = require;
  globalThis.__dirname = WASM_DIR;
  (0, eval)(fs.readFileSync(path.join(WASM_DIR, "seal.js"), "utf8"));
  const SealModule = globalThis.SealModule;
  _modPromise = SealModule({ locateFile: (p) => path.join(WASM_DIR, p), print() {}, printErr() {} });
  return _modPromise;
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// Verify the loaded binary is the pinned kernel (fail closed on mismatch).
function verifyKernelSha() {
  const got = sha256Hex(fs.readFileSync(path.join(WASM_DIR, "seal.wasm")));
  if (got !== KERNEL_WASM_SHA256) {
    throw new Error(`kernel sha256 mismatch: pinned ${KERNEL_WASM_SHA256}, got ${got}`);
  }
  return got;
}

async function createDecider(policyPath) {
  const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  verifyKernelSha();
  const M = await loadModule();
  const cfg = await import(path.join(ROOT, "seal-config.js"));
  // The SHARED receipt seam (vendored byte-identical from seal-check canonical).
  // Emission goes through assembleReceiptV2 — one schema, no gateway fork.
  const rf = await import(path.join(ROOT, "receipt-format.js"));

  // The capability targets the gateway will present (the agent's static grants).
  const granted = policy.granted_capabilities.map((g) =>
    cfg.stableHash([g.tool, g.table, g.operation])
  );

  // Decide one tool-call. With bypass=true the seal decision is SKIPPED entirely
  // (the seal-off control) — SAME executor, only this flag differs.
  function decide(toolCall, { bypass = false } = {}) {
    // Normalized argument object in the pinned key order (§2: stored key order is
    // significant; the same bytes the previous emitter produced).
    const args = { operation: toolCall.operation, table: toolCall.table, payload: toolCall.payload };
    const request_line = rf.canonicalRequest("db.execute", args);
    const request_sha256 = sha256Hex(request_line);
    const base = {
      tool: "db.execute",
      arguments: args,
      canonical_request: request_line,
      canonical_request_sha256: request_sha256,
      bypass,
    };

    if (bypass) {
      // No mediation. Record honestly that seal was removed from the path.
      // v2 honesty rule: no args_hash, no approval — nothing was mediated.
      return finalizeReceipt(rf.assembleReceiptV2({
        ...base,
        verdict: "ALLOW",
        reason: "SEAL_DECISION_BYPASS=1 — seal removed from the path; no mediation performed",
        deny_kernel: null,
        certs: [],
        kernel_identity: bypassKernelIdentity(),
      }));
    }

    const ir = JSON.parse(
      M.ccall("seal_init", "string", ["string", "string"], [cfg.buildEnvelope(policy.kernel_config), cfg.PUBKEY])
    );
    if (ir.ok !== true) throw new Error("seal_init failed: " + JSON.stringify(ir));
    const step = cfg.buildStepInput({
      tool: "db.execute", args, approvals: granted,
    });
    const raw = M.ccall("seal_decide", "string", ["string"], [step]);
    const parsed = cfg.parseVerdict(raw, "db.execute");
    const verdict = parsed.verdict === "DENY" ? "BLOCK" : parsed.verdict; // ALLOW|BLOCK|ERROR
    return finalizeReceipt(rf.assembleReceiptV2({
      ...base,
      verdict,
      // §11.2: the gateway's grants are static entries read from the policy FILE;
      // that channel carries no nonce/issued_at/expiry, so none is asserted
      // (unknown = absent, never fabricated). policy_hash and args_hash are
      // derived inside the seam. db.execute is not payment-class: no payment fields.
      approval: verdict === "ALLOW" ? { approval_identity: { channel: "file" } } : undefined,
      reason: parsed.reason,
      deny_kernel: parsed.deny_kernel ?? null,
      certs: parsed.certs,
      emitted_bytes: raw,
      kernel_identity: realKernelIdentity(),
      asserted_provenance: assertedProvenance(),
      // Self-contained re-derivation inputs: anyone (e.g. seal-check) can reproduce
      // this verdict in-browser from the receipt alone, no access to this gateway.
      policy_id: policy.policy_id,
      kernel_config: policy.kernel_config,
      granted_capabilities: policy.granted_capabilities.map(({ tool, table, operation }) => ({ tool, table, operation })),
    }));
  }

  // §4 HARD SPLIT: identity = the binary fact only; toolchain/axiom provenance is
  // ASSERTED, lives in its own block, and is never part of any verified claim.
  function realKernelIdentity() {
    return {
      wasm_sha256: KERNEL_WASM_SHA256,
      self_verified: true,
      note: "Verified mediation DECISION FUNCTION (modulo A1-A3, for calls that reach seal). Binary identity only; host/container wiring is NOT verified.",
    };
  }
  function assertedProvenance() {
    return {
      verified_in_browser: false,
      lean_toolchain: LEAN_TOOLCHAIN,
      axioms: KERNEL_AXIOMS,
      note: "What the public Lean proofs ASSERT about the kernel source. NOT re-checked here and NOT part of the binary hash.",
    };
  }
  function bypassKernelIdentity() {
    return { wasm_sha256: null, self_verified: false, note: "seal bypassed; the verified kernel did not run." };
  }

  // demo-key signature = HMAC-SHA256 over the canonical receipt core. Integrity check
  // for the re-derivation demo, NOT a production identity signature. Keyed on the v2
  // discriminator since the schema bump: signature bytes CHANGED vs the v0 emitter —
  // expected and documented, not a regression (the demo key proves nothing but
  // transport integrity either way).
  function finalizeReceipt(r) {
    const core = JSON.stringify({
      seal_receipt: r.seal_receipt, tool: r.tool, arguments: r.arguments,
      canonical_request_sha256: r.canonical_request_sha256, verdict: r.verdict,
      deny_kernel: r.deny_kernel ?? null, certs: r.certs || [], bypass: r.bypass,
    });
    r.signature = {
      alg: "HMAC-SHA256",
      value: crypto.createHmac("sha256", DEMO_KEY).update(core).digest("hex"),
      note: "demo-key signed (integrity check, not production identity)",
    };
    return r;
  }

  return {
    decide,
    grantedTargets: granted,
    policyId: policy.policy_id,
    kernelSha: KERNEL_WASM_SHA256,
  };
}

module.exports = { createDecider, sha256Hex, KERNEL_WASM_SHA256 };
