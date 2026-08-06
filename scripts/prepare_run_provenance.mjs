#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { ROOT, readProvenance, validateProvenance } from "./provenance.mjs";

const live = process.argv.includes("--live");
const dir = path.resolve(process.env.EVIDENCE_DIR || path.join(ROOT, "evidence"));
fs.mkdirSync(dir, { recursive: true });
const p = structuredClone(readProvenance(path.join(ROOT, "provenance.json")));
const command = (bin, args) => { try { return execFileSync(bin, args, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return "?"; } };
const commit = live ? (process.env.GITHUB_SHA || "?") : command("git", ["rev-parse", "HEAD"]);
const workflow = path.join(ROOT, ".github/workflows/demo.yml");

if (live) {
  p.runner = ".github/workflows/demo.yml";
  p.model = process.env.MODEL || "openai/gpt-4o-mini";
  p.generated_by = "demo.yml";
  p.run_environment = "github-actions";
  p.tool_call = { mode: "live", generated_by: "agent/agent.mjs" };
}
p.commit = commit;
validateProvenance(p, live ? "generated live-run fact" : "generated local-run fact");
fs.writeFileSync(path.join(dir, "provenance.json"), `${JSON.stringify(p, null, 2)}\n`);

const runMeta = {
  commit,
  generated_at: new Date().toISOString(),
  workflow_hash: fs.existsSync(workflow) ? crypto.createHash("sha256").update(fs.readFileSync(workflow)).digest("hex") : "?",
  policy: "seal-live-demo-d0",
  ...(process.env.GITHUB_RUN_ID ? { run_id: process.env.GITHUB_RUN_ID } : {}),
};
fs.writeFileSync(path.join(dir, "run-meta.json"), `${JSON.stringify(runMeta, null, 2)}\n`);
console.log(`PROVENANCE prepared: runner=${p.runner} model=${p.model} generated_by=${p.generated_by} tool_call=${p.tool_call.mode}`);
console.log(`PROVENANCE source: ${path.join(dir, "provenance.json")}`);
