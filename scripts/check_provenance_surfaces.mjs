#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "./provenance.mjs";

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "provenance-surfaces.json"), "utf8"));
if (manifest.source !== "provenance.json") throw new Error("surface manifest must name provenance.json as its source");
if (!Array.isArray(manifest.hand_written_exceptions)) throw new Error("surface manifest must count hand-written exceptions");

const files = [...new Set(manifest.generated.flatMap((s) => s.file ? [s.file] : []))];
const before = new Map(files.map((file) => [file, fs.readFileSync(path.join(ROOT, file))]));
const generated = spawnSync(process.execPath, [path.join(ROOT, "scripts/generate_provenance_surfaces.mjs")], {
  cwd: ROOT,
  env: { ...process.env, PROVENANCE_FILE: path.join(ROOT, "provenance.json") },
  encoding: "utf8",
});
const drift = [];
for (const [file, original] of before) {
  const full = path.join(ROOT, file);
  const after = fs.readFileSync(full);
  if (!original.equals(after)) drift.push(file);
  fs.writeFileSync(full, original);
}
if (generated.status !== 0) {
  process.stdout.write(generated.stdout || "");
  process.stderr.write(generated.stderr || "");
  throw new Error(`provenance generator exited ${generated.status}`);
}
if (drift.length) throw new Error(`generated provenance drift: ${drift.join(", ")}`);

// A new causal producer sentence outside a generated surface must stop the build.
const claimPattern = /(same AI|agent.{0,40}(trick|obey|fell)|agent (read|emitted|asked)|model (declined|emitted|produced)|scripted tool-call|local-synthetic|generated_by|bundle provenance)/i;
const scanFiles = ["README.md", "FINDINGS.md", "pwa/index.html", "pwa/replay.js", "scenarios/p1_benign.json", "scenarios/p2_attack.json", "scripts/replay_p3.mjs", "scripts/run_local.sh", "test/local-harness.cjs", "docker-compose.verify.yml"];
const allowedGeneratedFiles = new Set(["README.md", "FINDINGS.md", "pwa/index.html"]);
const violations = [];
for (const file of scanFiles) {
  let text = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (allowedGeneratedFiles.has(file)) text = text.replace(/<!-- provenance-generated:[^:]+:begin -->[\s\S]*?<!-- provenance-generated:[^:]+:end -->/g, "");
  text.split("\n").forEach((line, i) => { if (claimPattern.test(line)) violations.push(`${file}:${i + 1}: ${line.trim()}`); });
}
if (violations.length) throw new Error(`hand-written provenance prose found:\n${violations.join("\n")}`);

console.log(`PASS generated provenance surfaces are current (${files.length} files)`);
console.log(`PASS hand-written provenance exceptions = ${manifest.hand_written_exceptions.length}`);
