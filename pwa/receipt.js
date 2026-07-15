// SPDX-License-Identifier: Apache-2.0
// Browser receipt verification mirrored from seal-check@400079c. Verification
// consumes the receipt's exact signed_config and never invokes the demo signer.
import { decideSignedRaw, verifyKernelSha } from "./seal-wasm.js";
import {
  HOST_AUDIT_VERDICT_MAP,
  canonicalRequest, canonicalRequestSha256, capabilityTargetsFromPolicy,
  sha256Hex, validateReceipt,
} from "./receipt-format.js";

// §11.1 helpers for unparseable-request receipts -----------------------------

// Ed25519 over the exact signed_config payload bytes — the same check
// seal_init performs, done directly because the kernel cannot be invoked
// without a parseable call.
async function verifyConfigSignature(sc) {
  try {
    if (typeof sc.pubkey !== "string" || typeof sc.signature !== "string" ||
        typeof sc.payload !== "string") return false;
    const bytes = (hex) => Uint8Array.from(hex.match(/../g), (b) => parseInt(b, 16));
    const key = await globalThis.crypto.subtle.importKey(
      "raw", bytes(sc.pubkey), { name: "Ed25519" }, false, ["verify"]);
    return await globalThis.crypto.subtle.verify(
      "Ed25519", key, bytes(sc.signature), new TextEncoder().encode(sc.payload));
  } catch {
    return false;
  }
}

// The kernel material an unparseable-request receipt carries must at least
// agree with itself: the audit embedded in emitted_bytes names the same
// verdict and certs the receipt asserts. Consistency, not replay — the
// emitted bytes do not commit to the raw line.
function auditConsistent(receipt) {
  try {
    const audit = JSON.parse(JSON.parse(receipt.emitted_bytes).audit);
    return HOST_AUDIT_VERDICT_MAP[audit.verdict] === receipt.verdict &&
      JSON.stringify(audit.certs) === JSON.stringify(receipt.certs);
  } catch {
    return false;
  }
}

export async function verifyReceipt(receipt, { expectedConfigPubkey } = {}) {
  const out = {
    receipt,
    signature_valid: false,
    kernel_replay_consistent: false,
    authority_trusted: false,
    config_freshness: null,
    outcome: "failure",
    allGood: false,
    bindingErrors: [],
    grantErrors: [],
  };

  const shape = validateReceipt(receipt);
  out.formatOk = shape.ok;
  out.formatVersion = shape.version;
  out.formatErrors = shape.errors;
  if (!shape.ok) { out.mediated = null; return out; }

  if (receipt.bypass) {
    out.mediated = false;
    out.notMediated = "bypass receipt — seal was removed from the path; no kernel verdict exists";
    return out;
  }
  out.mediated = true;

  // §11.1 unparseable-request receipt: the kernel judged a wire line the
  // producer could not re-parse (seal-host main @ 3a74dbf). request_sha256
  // (SHA-256 of the raw line) is the only request commitment; canonical
  // re-derivation and kernel replay both need the (tool, arguments) the
  // receipt honestly does not carry. Everything else is still verified and
  // the outcome is its own reduced-scope state — never a bare PASS.
  out.unparseableRequest = typeof receipt.request_parse_error === "string";

  const signedConfig = receipt.signed_config;
  const pinSupplied = expectedConfigPubkey !== undefined;
  if (pinSupplied && (typeof expectedConfigPubkey !== "string" || !/^[0-9a-f]{64}$/.test(expectedConfigPubkey))) {
    out.pinError = "expectedConfigPubkey must be 64 lowercase hex characters";
  } else if (!signedConfig || typeof signedConfig.pubkey !== "string") {
    out.authority_trusted = false;
  } else if (!pinSupplied) {
    out.authority_trusted = "unpinned";
  } else {
    out.authority_trusted = expectedConfigPubkey === signedConfig.pubkey;
    if (!out.authority_trusted) out.pinError = "unauthorised config signer";
  }

  const sha = await verifyKernelSha();
  out.kernelSha = sha.computed;
  out.kernelShaMatch = sha.match && receipt.kernel_identity.wasm_sha256 === sha.computed;
  if (out.unparseableRequest) {
    // Not a match, not a mismatch — its own state (undefined === undefined is
    // not verification).
    out.requestHash = null;
    out.requestLine = null;
    out.requestHashMatch = null;
    out.rawLineIdentity = receipt.request_sha256;
    out.requestIdentityNote = "no canonical re-derivation possible; raw line identity only (request_sha256)";
  } else {
    out.requestHash = canonicalRequestSha256(receipt.tool, receipt.arguments);
    out.requestLine = canonicalRequest(receipt.tool, receipt.arguments);
    out.requestHashMatch = out.requestHash === receipt.canonical_request_sha256;
  }

  let signedPayload = null;
  let freshnessCandidate = null;
  if (!signedConfig || typeof signedConfig.payload !== "string") {
    out.bindingErrors.push("signed_config payload unavailable");
  } else {
    try {
      signedPayload = JSON.parse(signedConfig.payload);
      if (JSON.stringify(signedPayload) !== signedConfig.payload)
        out.bindingErrors.push("signed_config.payload is not its byte-identical compact reconstruction");
      if (JSON.stringify(receipt.kernel_config) !== signedConfig.payload)
        out.bindingErrors.push("kernel_config does not byte-equal signed_config.payload");
      if (receipt.approval && receipt.approval.policy_hash !==
          sha256Hex(new TextEncoder().encode(signedConfig.payload)))
        out.bindingErrors.push("approval.policy_hash does not equal sha256(signed_config.payload)");
      if (!signedPayload || !Number.isInteger(signedPayload.epoch) || signedPayload.epoch < 0) {
        out.bindingErrors.push("signed config requires a non-negative integer epoch");
      } else {
        freshnessCandidate = { field: "epoch", value: signedPayload.epoch, rollback_enforced: false };
      }
    } catch (error) {
      out.bindingErrors.push("signed_config.payload is not valid JSON: " + error.message);
    }
  }
  out.bindingOk = out.bindingErrors.length === 0;

  const grants = capabilityTargetsFromPolicy(signedPayload, receipt.granted_capabilities);
  out.opaqueGrants = grants.opaque;
  out.grantErrors = grants.errors;
  out.rederived = null;
  out.verdictMatch = null;
  out.emittedBytesMatch = null;
  if (out.unparseableRequest) {
    out.replayUnavailable = "unparseable-request receipt — no (tool, arguments) to replay";
    if (out.bindingOk && grants.errors.length === 0 && signedConfig) {
      out.signature_valid = await verifyConfigSignature(signedConfig);
      if (out.signature_valid) out.config_freshness = freshnessCandidate;
    }
    out.kernelMaterialConsistent = auditConsistent(receipt);
  } else if (out.bindingOk && grants.errors.length === 0) {
    try {
      const res = await decideSignedRaw(signedConfig, {
        tool: receipt.tool, args: receipt.arguments, approvals: grants.approvals,
        now: receipt.now ?? 1000,
      });
      out.signature_valid = res.signature_valid;
      if (!res.signature_valid) {
        out.rederiveError = "seal_init failed: " + res.initError;
      } else {
        out.config_freshness = freshnessCandidate;
        out.rederived = res.parsed.verdict === "DENY" ? "BLOCK" : res.parsed.verdict;
        out.verdictMatch = out.rederived === receipt.verdict;
        out.emittedBytesMatch = typeof receipt.emitted_bytes === "string"
          ? res.raw === receipt.emitted_bytes : null;
        out.kernel_replay_consistent = out.verdictMatch === true && out.emittedBytesMatch === true;
      }
    } catch (error) {
      out.rederiveError = error.message;
    }
  }

  // Reduced-scope core for unparseable-request receipts: everything the
  // receipt carries is verified; what it honestly cannot carry (canonical
  // request re-derivation, kernel replay) is excluded rather than failed.
  const verificationCore = out.unparseableRequest
    ? out.formatOk && out.kernelShaMatch && out.bindingOk &&
      out.grantErrors.length === 0 && out.signature_valid && out.kernelMaterialConsistent === true
    : out.formatOk && out.kernelShaMatch && out.requestHashMatch &&
      out.bindingOk && out.grantErrors.length === 0 && out.signature_valid &&
      out.kernel_replay_consistent;
  out.verificationCore = verificationCore;
  out.outcome = !verificationCore || out.authority_trusted === false
    ? "failure"
    : out.authority_trusted !== true ? "unpinned"
    : out.unparseableRequest ? "authorised-unparseable" : "authorised";
  out.allGood = out.outcome === "authorised";
  return out;
}

// Pure UI mapping so browser rendering and Node tests share the same security
// vocabulary. Even an accidentally pinned result never renders authorised-green
// in this unpinned browser surface.
export function verificationPresentation(receipt, result) {
  if (result.notMediated) return {
    tone: "warn", status: "NOT MEDIATED",
    summary: "NOT MEDIATED — seal was bypassed; no kernel verdict exists.",
  };
  // §11.1: name the reduced scope calmly — its own state, never a bare pass.
  if (result.unparseableRequest && result.verificationCore) return {
    tone: "warn", status: "RAW-LINE IDENTITY ONLY",
    summary: "Unparseable-request receipt (§11.1): kernel identity, signed-config binding, config signature and kernel-material consistency verified; the wire line could not be re-parsed, so no canonical re-derivation or kernel replay is possible. Request identity is request_sha256 over the raw line.",
  };
  if (result.outcome === "unpinned") return {
    tone: "warn", status: "UNPINNED",
    summary: `AUTHENTIC + REPLAY-CONSISTENT, authority NOT established (signed by ${receipt.signed_config.pubkey}; verify it out-of-band).`,
  };
  if (result.outcome === "authorised") return {
    tone: "bad", status: "PIN NOT ACCEPTED HERE",
    summary: "This browser surface never establishes operator authority; use the pinned CLI or CI action.",
  };
  return { tone: "bad", status: "FAILED",
    summary: "FAILED verification — treat this receipt as tampered or invalid." };
}
