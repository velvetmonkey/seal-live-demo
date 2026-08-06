// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function provenancePath() {
  if (process.env.PROVENANCE_FILE) return path.resolve(process.env.PROVENANCE_FILE);
  return path.join(ROOT, "provenance.json");
}

const hex64 = /^[0-9a-f]{64}$/;

export function validateProvenance(p, source = provenancePath()) {
  const fail = (message) => { throw new Error(`invalid provenance ${source}: ${message}`); };
  if (!p || p.schema_version !== 1) fail("schema_version must be 1");
  for (const key of ["runner", "model", "generated_by", "run_environment"]) {
    if (typeof p[key] !== "string" || !p[key]) fail(`${key} must be a non-empty string`);
  }
  if (!["local", "github-actions"].includes(p.run_environment)) fail("run_environment must be local or github-actions");
  if (!["synthetic", "live"].includes(p.tool_call?.mode)) fail("tool_call.mode must be synthetic or live");
  if (typeof p.tool_call?.generated_by !== "string" || !p.tool_call.generated_by) fail("tool_call.generated_by is required");
  for (const [name, value] of [
    ["kernel.sha256", p.kernel?.sha256],
    ["bundle.sha256", p.bundle?.sha256],
    ["request.sha256", p.request?.sha256],
  ]) if (!hex64.test(value || "")) fail(`${name} must be 64 lowercase hex characters`);
  if (typeof p.bundle?.path !== "string" || !p.bundle.path) fail("bundle.path is required");
  if (p.commit && !/^[0-9a-f]{40}$/.test(p.commit)) fail("commit must be 40 lowercase hex characters");
  const h = p.historical_capture;
  if (!h || !["model", "bundle_path", "runner"].every((key) => typeof h[key] === "string" && h[key])) fail("historical_capture strings are required");
  if (!hex64.test(h.kernel_sha256 || "") || !hex64.test(h.request_sha256 || "")) fail("historical_capture hashes must be 64 lowercase hex characters");
  if (h.run_environment !== "github-actions" || h.tool_call_mode !== "live") fail("historical_capture must describe its GitHub Actions live run");
  return p;
}

export function readProvenance(file = provenancePath()) {
  return validateProvenance(JSON.parse(fs.readFileSync(file, "utf8")), file);
}

export function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function isSynthetic(p) {
  return p.tool_call.mode === "synthetic";
}

export function provenanceCopy(p) {
  const synthetic = isSynthetic(p);
  const trueSentence = synthetic
    ? "Real gateway, real kernel, real Postgres, real receipts, real block. The only synthetic element is the tool-call, scripted rather than emitted by a model."
    : `Real gateway, real kernel, real Postgres, real receipts, real block, and a live tool-call emitted by ${p.model}.`;
  return {
    synthetic,
    trueSentence,
    headline: synthetic
      ? "Watch a scripted destructive tool-call hit a real gateway — and Seal block it. Remove Seal and the identical request destroys the data. One command, real evidence, visible outcome."
      : `Watch a live ${p.model} tool-call hit a real gateway — and Seal block it. Remove Seal and the identical request destroys the data. One run, real evidence, visible outcome.`,
    p1: synthetic
      ? "The local runner submits an approved staging insert. Seal allows it."
      : `The live ${p.model} run emits an approved staging insert. Seal allows it.`,
    p2: synthetic
      ? "The local runner submits the destructive request encoded by the hostile-data scenario. Seal blocks it; the 10,000 records survive."
      : `Hostile data causes ${p.model} to emit a destructive production delete. Seal blocks it; the 10,000 records survive.`,
    wiring: synthetic
      ? "The local runner submits tool-calls to Postgres through the real gateway and kernel. The attack bytes are scripted; the decision, database effects, receipts, and block are real."
      : `The live ${p.model} runner submits tool-calls to Postgres through the real gateway and kernel. The model emits the attack request; the decision, database effects, receipts, and block are real.`,
    oneCommand: synthetic
      ? "One command spins up the real gateway + kernel + Postgres path. It scripts only the tool-call, then shows Phase 1 ALLOW, Phase 2 BLOCK with rows unchanged, and Phase 3 replay the identical bytes with Seal off and destroy the table. Real row counts, receipts, and a final \"ASSERT OK\" land in your terminal."
      : `One run drives the real ${p.model} + gateway + kernel + Postgres path. It shows Phase 1 ALLOW, Phase 2 BLOCK with rows unchanged, and Phase 3 replay the identical bytes with Seal off and destroy the table. Real row counts, receipts, and a final \"ASSERT OK\" land in the run log.`,
    replayLead: synthetic
      ? "This shipped replay is the local synthetic run: the tool-call is scripted, while the gateway, kernel, Postgres, receipts, block, and control are real."
      : `This shipped replay is a live ${p.model} run: the model emitted the tool-call, and the gateway, kernel, Postgres, receipts, block, and control are real.`,
    pwaTitle: synthetic ? "seal · scripted tool-call — evidence replay" : "seal · live model tool-call — evidence replay",
    pwaDescription: synthetic
      ? "Replays real gateway, kernel, Postgres, receipt, and block evidence from a run whose tool-call was scripted."
      : `Replays real gateway, kernel, Postgres, receipt, and block evidence from a live ${p.model} run.`,
    pwaTag: synthetic
      ? "Same scripted request. Same real systems. The only difference is one verified gate."
      : `Same ${p.model} request. Same real systems. The only difference is one verified gate.`,
    narration1: synthetic
      ? "The shipped run submits the hostile-data scenario's destructive bytes as a scripted tool-call; no model emitted them."
      : `The hostile record caused ${p.model} to emit this destructive tool-call.`,
    narration3: synthetic
      ? "Same scripted request bytes, now with the verified gate: the deletion never reaches the database."
      : `Same ${p.model} request bytes, now with the verified gate: the deletion never reaches the database.`,
    assertProducer: synthetic
      ? "P2 tool-call provenance = scripted (no model emission)"
      : `P2 tool-call provenance = live ${p.model} emission`,
    summaryHeadline: synthetic
      ? "A scripted destructive tool-call ordered a database wipe. The gate refused."
      : `${p.model} emitted a destructive database-wipe tool-call. The gate refused.`,
  };
}
