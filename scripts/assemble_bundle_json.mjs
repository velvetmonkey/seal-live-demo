// SPDX-License-Identifier: Apache-2.0
// Assemble the captured evidence files into one bundle.json that the PWA replays, and
// copy the policy so the PWA can RE-DERIVE verdicts in-browser (real-only replay +
// tamper test). Fabricates nothing, it only collates files the run already emitted.
import fs from "node:fs";
import path from "node:path";

const DIR = process.env.EVIDENCE_DIR || "evidence";
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { return null; } };
const POLICY_PATH = process.env.SEAL_POLICY_SRC || ".seal/policy.json";
const policy = (() => { try { return JSON.parse(fs.readFileSync(POLICY_PATH, "utf8")); } catch { return null; } })();

const bundle = {
  kind: "seal-live-demo-evidence",
  version: "v0",
  meta: read("run-meta.json"),
  probe: read("probe.json"),
  policy,
  snapshots: { before: read("snap-before.json"), after_p2: read("snap-after-p2.json"), after_p3: read("snap-after-p3.json") },
  phases: { p1: read("agent-p1.json"), p2: read("agent-p2.json"), p3: read("p3-control.json") },
};
fs.writeFileSync(path.join(DIR, "bundle.json"), JSON.stringify(bundle, null, 2));
console.log(`bundle.json written (${DIR}/bundle.json)`);
