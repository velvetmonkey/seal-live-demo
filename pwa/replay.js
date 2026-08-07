// SPDX-License-Identifier: Apache-2.0
// Evidence-replay controller. Loads the captured bundle.json and animates
// only captured values. Re-derives verdicts live in-browser via the same kernel.
// Drama rule: if it wasn't emitted by the run, it doesn't appear here.
import { ready, verifyKernelSha } from "./seal-wasm.js";
import { verificationPresentation, verifyReceipt } from "./receipt.js";
import { PROVENANCE, PROVENANCE_COPY } from "./provenance-copy.js";

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let BUNDLE = null;

function b64urlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
  const bin = atob(s); const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// A deep-linked receipt (#receipt=<base64url>) — re-derive it on-device, fragment
// never leaves the browser.
async function handleDeepLink() {
  const params = new URLSearchParams(location.hash.slice(1));
  const enc = params.get("receipt");
  if (!enc) return false;
  const banner = $("deeplink-banner");
  banner.classList.remove("hidden");
  let receiptDocument, receipt;
  try {
    receiptDocument = b64urlDecode(enc);
    receipt = JSON.parse(receiptDocument);
  } catch (e) { banner.innerHTML = `<b>Deep-linked receipt:</b> could not decode (${e.message}).`; return true; }
  $("tamper-input").value = JSON.stringify(receipt, null, 2);
  $("receipt-view").classList.remove("hidden");
  $("rv-json").textContent = JSON.stringify(receipt, null, 2);
  try {
    const result = await verifyReceipt(receiptDocument);
    renderVerification(receipt, result);
    const view = verificationPresentation(receipt, result);
    banner.textContent = view.summary + " Nothing was sent to a server.";
    banner.className = "deeplink " + view.tone;
  } catch (e) { banner.textContent = "re-derive error: " + e.message; banner.className = "deeplink bad"; }
  return true;
}

if (location.protocol === "file:") { $("boot-error").hidden = false; }

function renderVerification(receipt, result) {
  const view = verificationPresentation(receipt, result);
  const rv = $("rv-rederive");
  rv.textContent = view.status;
  rv.className = "rederive " + view.tone;
  const checks = $("rv-checks");
  checks.replaceChildren();
  const line = (text, cls) => { const li = document.createElement("li"); li.textContent = text; li.className = cls; checks.appendChild(li); };
  line(`signature_valid: ${result.signature_valid}`, result.signature_valid ? "ok" : "bad");
  line(`kernel_replay_consistent: ${result.kernel_replay_consistent}`, result.kernel_replay_consistent ? "ok" : "bad");
  line(`authority_trusted: ${result.authority_trusted === "unpinned" ? "UNPINNED" : result.authority_trusted}`,
    result.authority_trusted === "unpinned" ? "warn" : "bad");
  if (result.config_freshness) line(
    `config freshness: ${result.config_freshness.field}=${result.config_freshness.value}; rollback enforcement=${result.config_freshness.rollback_enforced}`, "muted");
  $("rv-summary").textContent = view.summary;
  $("rv-summary").className = "verification-summary " + view.tone;
}

// --- counter + grid (100 cells = the whole table; caption carries the raw number) ---
const CELLS = 100;
function buildGrid(el) { el.innerHTML = ""; for (let i = 0; i < CELLS; i++) { const d = document.createElement("div"); d.className = "cell"; el.appendChild(d); } }
function setGrid(el, rows, total) {
  const filled = total > 0 ? Math.round((rows / total) * CELLS) : 0;
  [...el.children].forEach((c, i) => c.classList.toggle("gone", i >= filled));
}
function tween(el, gridEl, from, to, total, ms, cls) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (to - from) * e);
      el.textContent = v.toLocaleString();
      setGrid(gridEl, v, total);
      if (t < 1) requestAnimationFrame(step); else { el.classList.add(cls); resolve(); }
    };
    requestAnimationFrame(step);
  });
}

async function play() {
  const before = BUNDLE.snapshots.before.rows;
  const offAfter = BUNDLE.snapshots.after_p3.rows;
  const onAfter = BUNDLE.snapshots.after_p2.rows;
  $("count-off").className = "count"; $("count-on").className = "count";
  $("count-off").textContent = before.toLocaleString(); $("count-on").textContent = before.toLocaleString();
  setGrid($("grid-off"), before, before); setGrid($("grid-on"), before, before);
  $("narration").textContent = PROVENANCE_COPY.narration1;
  await sleep(1200);
  $("narration").textContent = "Without the gate: the deletion reaches the database.";
  await tween($("count-off"), $("grid-off"), before, offAfter, before, 1800, "crater");
  $("cap-off").textContent = offAfter === 0 ? "ALL CUSTOMER RECORDS DELETED" : "customer records";
  await sleep(700);
  $("narration").textContent = PROVENANCE_COPY.narration3;
  await tween($("count-on"), $("grid-on"), before, onAfter, before, 1200, "held");
  $("cap-on").textContent = "customer records — unchanged";
  const h = BUNDLE.phases.p2.receipt.canonical_request_sha256;
  const same = h === BUNDLE.phases.p3.receipt.canonical_request_sha256;
  $("hash-line").textContent = `identical canonical request on both sides: ${h.slice(0, 24)}…  ${same ? "✓" : "⚠ differs"}`;
}

// --- phase cards + receipt re-derivation ---
function phaseCards() {
  const defs = [
    { key: "p1", title: "Phase 1 — legitimate task", tone: "ok", sub: "insert → staging" },
    { key: "p2", title: "Phase 2 — attack, seal ON", tone: "block", sub: "delete_all → prod · BLOCK (hero)" },
    { key: "p3", title: "Phase 3 — same attack, seal OFF", tone: "crater", sub: "control · destroyed" },
  ];
  const wrap = $("phase-cards"); wrap.innerHTML = "";
  for (const d of defs) {
    const r = BUNDLE.phases[d.key].receipt;
    const card = document.createElement("button");
    card.className = `card ${d.tone}`;
    card.innerHTML = `<div class="card-title">${d.title}</div><div class="card-sub mono">${d.sub}</div>` +
      `<div class="card-verdict">${r.verdict}${r.deny_kernel ? " · " + r.deny_kernel : ""}</div>`;
    card.addEventListener("click", () => showReceipt(d.key));
    wrap.appendChild(card);
  }
}

async function showReceipt(key) {
  const ph = BUNDLE.phases[key];
  const r = ph.receipt;
  $("receipt-view").classList.remove("hidden");
  $("rv-json").textContent = JSON.stringify(ph, null, 2);
  const rv = $("rv-rederive");
  rv.textContent = "verifying exact signed bytes…"; rv.className = "rederive";
  try {
    renderVerification(r, await verifyReceipt(r));
  } catch (e) { rv.textContent = "re-derive error: " + e.message; rv.className = "rederive bad"; }
}

// --- tamper test ---
async function tamper() {
  const out = $("tamper-result");
  let edited;
  try { edited = JSON.parse($("tamper-input").value); } catch (e) { out.textContent = "invalid JSON: " + e.message; out.className = "mono bad"; return; }
  const receipt = edited.receipt || edited;
  if (!receipt.arguments) { out.textContent = "no receipt arguments to verify"; out.className = "mono bad"; return; }
  out.textContent = "verifying exact signed bytes…"; out.className = "mono";
  try {
    const result = await verifyReceipt(receipt);
    const view = verificationPresentation(receipt, result);
    out.textContent = view.summary;
    out.className = "mono " + view.tone;
  } catch (e) { out.textContent = "re-derive error: " + e.message; out.className = "mono bad"; }
}

async function init() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  try {
    BUNDLE = await (await fetch("bundle.json")).json();
  } catch (e) { $("narration").textContent = "could not load bundle.json — run scripts/run_local.sh first."; return; }
  await ready();
  const v = await verifyKernelSha();
  $("meta").textContent = `commit ${(PROVENANCE.commit || "?").slice(0, 12)} · model ${PROVENANCE.model} · tool-call ${PROVENANCE.tool_call.mode} · kernel ${(v.computed || "").slice(0, 12)}… ${v.match ? "self-verified ✓" : "⚠ SHA MISMATCH"}`;
  buildGrid($("grid-off")); buildGrid($("grid-on"));
  const before = BUNDLE.snapshots.before.rows;
  setGrid($("grid-off"), before, before); setGrid($("grid-on"), before, before);
  $("count-off").textContent = before.toLocaleString(); $("count-on").textContent = before.toLocaleString();
  phaseCards();
  $("tamper-input").value = JSON.stringify(BUNDLE.phases.p2.receipt, null, 2);
  $("play").addEventListener("click", play);
  $("tamper-run").addEventListener("click", tamper);
  await handleDeepLink();
}
init();
