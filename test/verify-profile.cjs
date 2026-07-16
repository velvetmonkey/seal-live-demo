// SPDX-License-Identifier: Apache-2.0
// Profile self-check (seal-assurance-kit docs/VERIFY-PROFILES.md): the PWA
// verifier copy declares VERIFY_PROFILE = "P-ENFORCE" and behaves per the
// P-ENFORCE row on a real gateway-emitted receipt:
//   pass, no pin   -> outcome "unpinned"    (ceiling without a trust anchor)
//   pass + pin     -> outcome "authorised"  BUT the exhibit presentation
//                     renders it "PIN NOT ACCEPTED HERE" (ENF-4: this replay
//                     surface never claims operator authority — never green)
//   wrong pin      -> outcome "failure"     (unauthorised config signer)
//   config-less    -> outcome "failure"     (signed_config binding required)
// Manual, like the rest of this repo's suite:  node test/verify-profile.cjs
//
// A red leg here means the copy is OFF ITS DECLARED PROFILE — a finding to
// report, not a test to re-green by editing the declaration.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO = path.resolve(__dirname, "..");
const PWA = path.join(REPO, "pwa");
const WASM = path.join(PWA, "wasm");
const PIN = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const DECL_RE = /VERIFY_PROFILE[^"']*["'](P-[A-Z]+)["']/;

// Real gateway-emitted receipt (same producer the PWA replays).
const emit = spawnSync(process.execPath, ["-e", `
  const path=require("node:path");
  const {createDecider}=require("./seal-gateway/decide.cjs");
  (async()=>{const d=await createDecider(path.resolve(".seal/policy.json"));
    process.stdout.write(JSON.stringify(d.decide({operation:"insert",table:"staging_deploy_audit",payload:"{}"})));})();
`], { cwd: REPO, encoding: "utf8" });
if (emit.status !== 0) throw new Error(emit.stderr || `gateway producer exited ${emit.status}`);
const genuine = JSON.parse(emit.stdout);
const clone = () => structuredClone(genuine);

// Browser shims (same approach as pwa/test/receipt-verify.cjs).
globalThis.require = require;
globalThis.__dirname = WASM;
(0, eval)(fs.readFileSync(path.join(WASM, "seal.js"), "utf8"));
globalThis.window = globalThis;
globalThis.fetch = async (p) => {
  const bytes = fs.readFileSync(path.join(PWA, String(p)));
  return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};

(async () => {
  const R = await import(path.join(PWA, "receipt.js"));
  const { verifyReceipt, verificationPresentation } = R;
  let failures = 0;
  const check = (name, pass, detail = "") => {
    if (!pass) failures++;
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  };

  // --- declaration ---
  const src = fs.readFileSync(path.join(PWA, "receipt.js"), "utf8");
  const m = src.match(DECL_RE);
  check("declaration: pwa/receipt.js declares a spec-grammar VERIFY_PROFILE", !!m);
  check("declaration: profile is P-ENFORCE", m && m[1] === "P-ENFORCE", m && m[1]);
  check("declaration: exported constant agrees", R.VERIFY_PROFILE === "P-ENFORCE",
    String(R.VERIFY_PROFILE));

  // --- P-ENFORCE behaviour on the genuine receipt ---
  const unpinned = await verifyReceipt(clone());
  check("P-ENFORCE: pass, no pin -> outcome unpinned (never a bare pass)",
    unpinned.outcome === "unpinned" && unpinned.allGood === false, unpinned.outcome);
  const unpinnedView = verificationPresentation(genuine, unpinned);
  check("exhibit surface: unpinned renders UNPINNED (warn), not a success state",
    unpinnedView.status === "UNPINNED" && unpinnedView.tone === "warn", unpinnedView.status);

  const pinned = await verifyReceipt(clone(), { expectedConfigPubkey: PIN });
  check("P-ENFORCE: pass + pin -> outcome authorised (the top verdict requires the pin)",
    pinned.outcome === "authorised" && pinned.authority_trusted === true, pinned.outcome);
  const pinnedView = verificationPresentation(genuine, pinned);
  check("exhibit surface (ENF-4): even pinned-authorised renders PIN NOT ACCEPTED HERE, never green",
    pinnedView.status === "PIN NOT ACCEPTED HERE" && pinnedView.tone === "bad", pinnedView.status);

  const wrongPin = await verifyReceipt(clone(), { expectedConfigPubkey: "0".repeat(64) });
  check("P-ENFORCE: wrong pin -> failure (unauthorised config signer)",
    wrongPin.outcome === "failure" && wrongPin.authority_trusted === false, wrongPin.outcome);

  const configless = clone();
  delete configless.signed_config;
  const noConfig = await verifyReceipt(configless, { expectedConfigPubkey: PIN });
  check("P-ENFORCE: config-less mediated -> failure (signed_config binding required)",
    noConfig.outcome === "failure", noConfig.outcome);

  console.log(failures === 0
    ? "\nVERIFY-PROFILE SELF-CHECK PASS — this copy is on its declared P-ENFORCE (exhibit) profile"
    : `\n${failures} FAILURE(S) — this copy is off its declared profile; report as a finding`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
