#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "./provenance.mjs";

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "provenance-surfaces.json"), "utf8"));
if (manifest.source !== "provenance.json") throw new Error("surface manifest must name provenance.json as its source");
if (!Array.isArray(manifest.hand_written_exceptions)) throw new Error("surface manifest must count hand-written exceptions");

const files = new Map();
for (const surface of manifest.generated) {
  if (!surface.file) continue;
  if (surface.checkout !== undefined && surface.checkout !== "per-run") {
    throw new Error(`${surface.file}: unknown checkout lifecycle ${JSON.stringify(surface.checkout)}`);
  }
  const perRun = surface.checkout === "per-run";
  if (files.has(surface.file) && files.get(surface.file) !== perRun) {
    throw new Error(`${surface.file}: conflicting checkout lifecycles in surface manifest`);
  }
  files.set(surface.file, perRun);
}

function isTracked(file) {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", "--", file], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.error) throw new Error(`${file}: cannot determine whether surface is tracked`, { cause: result.error });
  if (result.signal || ![0, 1].includes(result.status)) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${file}: cannot determine whether surface is tracked (git exited ${result.status ?? `on ${result.signal}`})`);
  }
  return result.status === 0;
}

const before = new Map();
const notPresent = [];
for (const [file, perRun] of files) {
  const tracked = isTracked(file);
  if (perRun && tracked) throw new Error(`${file}: per-run surface must not be tracked`);
  if (!perRun && !tracked) throw new Error(`${file}: untracked surface is not declared as a per-run artifact`);
  try {
    before.set(file, fs.readFileSync(path.join(ROOT, file)));
  } catch (error) {
    if (error?.code !== "ENOENT") throw new Error(`${file}: cannot read manifested surface`, { cause: error });
    if (tracked) throw new Error(`${file}: missing tracked manifested surface`, { cause: error });
    if (!perRun) throw new Error(`${file}: missing untracked surface is not declared as a per-run artifact`, { cause: error });
    notPresent.push(file);
  }
}

const drift = [];
try {
  const generated = spawnSync(process.execPath, [path.join(ROOT, "scripts/generate_provenance_surfaces.mjs")], {
    cwd: ROOT,
    env: { ...process.env, PROVENANCE_FILE: path.join(ROOT, "provenance.json") },
    encoding: "utf8",
  });
  if (generated.error) throw new Error("cannot run provenance generator", { cause: generated.error });
  if (generated.status !== 0) {
    process.stdout.write(generated.stdout || "");
    process.stderr.write(generated.stderr || "");
    throw new Error(`provenance generator exited ${generated.status ?? `on ${generated.signal}`}`);
  }
  for (const [file, original] of before) {
    const full = path.join(ROOT, file);
    let after;
    try {
      after = fs.readFileSync(full);
    } catch (error) {
      throw new Error(`${file}: cannot read regenerated surface`, { cause: error });
    }
    if (!original.equals(after)) drift.push(file);
  }
} finally {
  for (const [file, original] of before) fs.writeFileSync(path.join(ROOT, file), original);
  for (const file of notPresent) fs.rmSync(path.join(ROOT, file), { force: true });
}

for (const file of before.keys()) console.log(`${drift.includes(file) ? "DRIFTED" : "CURRENT"} ${file}`);
for (const file of notPresent) console.log(`NOT PRESENT IN THIS CHECKOUT ${file} (untracked per-run artifact)`);
const summary = `${before.size} checked, ${notPresent.length} not present in this checkout (per-run artifacts), ${drift.length} drifted`;
console.log(`${drift.length ? "FAIL" : "PASS"} generated provenance surfaces: ${summary}`);
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

console.log(`PASS hand-written provenance exceptions = ${manifest.hand_written_exceptions.length}`);
