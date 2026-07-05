// SPDX-License-Identifier: Apache-2.0
// Evidence-replay controller. Loads the REAL run bundle (bundle.json) and animates
// only captured values. Re-derives verdicts live in-browser via the same kernel.
// Drama rule: if it wasn't emitted by the run, it doesn't appear here.
import { decideConfig, ready } from "./seal-wasm.js";
import { stableHash } from "./seal-config.js";
import { sha256Hex } from "./sha256.js";

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KERNEL_SHA = "ebd17c14668176612c49f6e2940b23df82a2c1a7cdef6759f0d6276ae997e9d0";
let BUNDLE = null, GRANTS = [];

// Self-verify the kernel binary we actually loaded (hash it, compare to the pin).
async function verifyWasm() {
  try {
    const buf = new Uint8Array(await (await fetch("wasm/seal.wasm")).arrayBuffer());
    const got = await sha256Hex(buf);
    return { got, match: got === KERNEL_SHA };
  } catch (e) { return { got: null, match: false, err: e.message }; }
}

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
  let receipt;
  try { receipt = JSON.parse(b64urlDecode(enc)); } catch (e) { banner.innerHTML = `<b>Deep-linked receipt:</b> could not decode (${e.message}).`; return true; }
  $("tamper-input").value = JSON.stringify(receipt, null, 2);
  $("receipt-view").classList.remove("hidden");
  $("rv-json").textContent = JSON.stringify(receipt, null, 2);
  try {
    const live = await reDerive(receipt.arguments);
    const got = live.verdict === "DENY" ? "BLOCK" : live.verdict;
    const claimed = receipt.verdict;
    const okMatch = !claimed || claimed === got;
    banner.innerHTML = `<b>Deep-linked Block receipt</b> — re-derived on your device: kernel says <b>${got}</b>${claimed ? ` (receipt claims ${claimed})` : ""}. ${okMatch ? "✓ matches" : "⚠ MISMATCH — receipt rejected"}. Nothing was sent to a server.`;
    banner.className = "deeplink " + (okMatch ? "ok" : "bad");
    $("rv-rederive").textContent = okMatch ? `✓ re-derived: kernel says ${got}` : `⚠ re-derived ${got} ≠ receipt ${claimed}`;
    $("rv-rederive").className = "rederive " + (okMatch ? "ok" : "bad");
  } catch (e) { banner.textContent = "re-derive error: " + e.message; banner.className = "deeplink bad"; }
  return true;
}

if (location.protocol === "file:") { $("boot-error").hidden = false; }

function grantsFrom(policy) {
  return (policy?.granted_capabilities || []).map((g) => stableHash([g.tool, g.table, g.operation]));
}

// Re-derive a db.execute decision in-browser (the kernel, not the JSON, decides).
async function reDerive(args) {
  return decideConfig(BUNDLE.policy.kernel_config, { tool: "db.execute", args, approvals: GRANTS });
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
  $("narration").textContent = "An attacker hid a command inside a customer note. The agent read it and obeyed.";
  await sleep(1200);
  $("narration").textContent = "Without the gate: the deletion reaches the database.";
  await tween($("count-off"), $("grid-off"), before, offAfter, before, 1800, "crater");
  $("cap-off").textContent = offAfter === 0 ? "ALL CUSTOMER RECORDS DELETED" : "customer records";
  await sleep(700);
  $("narration").textContent = "Same agent, same attack, with the verified gate: the deletion never reaches the database.";
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
  if (r.bypass) { rv.textContent = "— seal was bypassed in this phase; no kernel decision to re-derive"; rv.className = "rederive muted"; return; }
  rv.textContent = "re-deriving in your browser…"; rv.className = "rederive";
  try {
    const live = await reDerive(r.arguments);
    const want = r.verdict;
    const got = live.verdict === "DENY" ? "BLOCK" : live.verdict;
    rv.textContent = got === want ? `✓ re-derived: kernel says ${got} (matches the receipt)` : `⚠ re-derived ${got} ≠ receipt ${want}`;
    rv.className = "rederive " + (got === want ? "ok" : "bad");
  } catch (e) { rv.textContent = "re-derive error: " + e.message; rv.className = "rederive bad"; }
}

// --- tamper test ---
async function tamper() {
  const out = $("tamper-result");
  let edited;
  try { edited = JSON.parse($("tamper-input").value); } catch (e) { out.textContent = "invalid JSON: " + e.message; out.className = "mono bad"; return; }
  const args = edited.arguments || edited.receipt?.arguments;
  if (!args) { out.textContent = "no .arguments to re-derive"; out.className = "mono bad"; return; }
  const claimed = edited.verdict || edited.receipt?.verdict;
  out.textContent = "re-deriving…"; out.className = "mono";
  try {
    const live = await reDerive(args);
    const got = live.verdict === "DENY" ? "BLOCK" : live.verdict;
    if (claimed && claimed !== got) {
      out.textContent = `REJECTED — receipt claims ${claimed}, but the kernel says ${got}. The kernel decides, not the JSON.`;
      out.className = "mono bad";
    } else {
      out.textContent = `kernel verdict on these bytes: ${got}${live.deny_kernel ? " (" + live.deny_kernel + ")" : ""} — matches the claim.`;
      out.className = "mono ok";
    }
  } catch (e) { out.textContent = "re-derive error: " + e.message; out.className = "mono bad"; }
}

async function init() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  try {
    BUNDLE = await (await fetch("bundle.json")).json();
  } catch (e) { $("narration").textContent = "could not load bundle.json — run scripts/run_local.sh first."; return; }
  GRANTS = grantsFrom(BUNDLE.policy);
  await ready();
  const m = BUNDLE.meta || {};
  const v = await verifyWasm();
  $("meta").textContent = `commit ${(m.commit || "?").slice(0, 12)} · model ${m.model || "?"} · policy ${m.policy || "?"} · kernel ${(v.got || "").slice(0, 12)}… ${v.match ? "self-verified ✓" : "⚠ SHA MISMATCH"}`;
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
