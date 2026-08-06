#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import { ROOT, readProvenance, sha256File, validateProvenance } from "./provenance.mjs";

const publish = process.argv.includes("--publish");
const dir = path.resolve(process.env.EVIDENCE_DIR || path.join(ROOT, "evidence"));
const source = path.join(dir, "provenance.json");
const bundlePath = path.join(dir, "bundle.json");
const p = readProvenance(source);
const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
const p2 = bundle.phases?.p2?.receipt;
const p3 = bundle.phases?.p3?.receipt;
if (!p2?.canonical_request_sha256 || p2.canonical_request_sha256 !== p3?.canonical_request_sha256) {
  throw new Error("cannot record provenance: P2/P3 request fingerprints are missing or unequal");
}
if (p2.kernel_identity?.wasm_sha256 !== p.kernel.sha256) {
  throw new Error(`kernel pin mismatch; fact=${p.kernel.sha256}, receipt=${p2.kernel_identity?.wasm_sha256 || "missing"}`);
}
p.request.sha256 = p2.canonical_request_sha256;
p.bundle.sha256 = sha256File(bundlePath);
validateProvenance(p, source);
fs.writeFileSync(source, `${JSON.stringify(p, null, 2)}\n`);
console.log(`bundle sha256 declared: ${p.bundle.sha256}`);
console.log(`bundle sha256 actual:   ${sha256File(bundlePath)}`);
console.log(`request sha256 P2:      ${p2.canonical_request_sha256}`);
console.log(`request sha256 P3:      ${p3.canonical_request_sha256}`);
if (publish) {
  fs.copyFileSync(bundlePath, path.join(ROOT, p.bundle.path));
  fs.writeFileSync(path.join(ROOT, "provenance.json"), `${JSON.stringify(p, null, 2)}\n`);
  console.log(`published bundle and provenance fact to ${p.bundle.path} and provenance.json`);
}
