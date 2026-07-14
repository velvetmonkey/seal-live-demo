// SPDX-License-Identifier: Apache-2.0
// Policy Lab — an interactive money-block. Re-decides a high-stakes payment live in
// the browser as the operator adds independent quorum sign-offs. Signing is pure JS
// (vendored tweetnacl), so this renders a verdict in every browser with no WebCrypto
// dependency. Same kernel, same signed-config path as the captured demo; only the
// vote count changes between clicks.
import { ready, decideConfig } from "./seal-wasm.js";
import { SCENARIOS } from "./seal-config.js";

const $ = (id) => document.getElementById(id);
const S = SCENARIOS["pay-after"]; // CFG_PAY_B: payments.send, safety-approved + 2-of-3 consensus

// N independent sign-offs = N distinct acceptors from the roster voting for the tool.
// votes is the raw consensus votes-file text the kernel consumes (NDJSON lines).
function votesFor(n) {
  const lines = [];
  for (let k = 1; k <= n; k++) lines.push(JSON.stringify({ acceptor: k, value: S.tool }));
  return lines.join("\n");
}

async function decide(n) {
  const verdictEl = $("lab-verdict"), reasonEl = $("lab-reason"), stepEl = $("lab-step");
  verdictEl.textContent = "deciding…";
  verdictEl.className = "lab-verdict mono";
  try {
    const v = await decideConfig(S.config, { tool: S.tool, args: S.args, approvals: S.approvals, votes: votesFor(n) });
    const allow = v.verdict === "ALLOW";
    verdictEl.textContent = allow ? "ALLOW — payment would execute" : "DENY — payment blocked";
    verdictEl.className = "lab-verdict mono " + (allow ? "ok" : "bad");
    reasonEl.textContent = `${n} of 3 sign-offs · ${v.reason}`;
    stepEl.hidden = false;
    stepEl.textContent = JSON.stringify(
      { tool: S.tool, args: S.args, sign_offs: n, verdict: v.verdict, deny_kernel: v.deny_kernel, certs: v.certs },
      null, 2);
  } catch (e) {
    verdictEl.textContent = "error";
    verdictEl.className = "lab-verdict mono bad";
    reasonEl.textContent = "re-derive error: " + e.message;
  }
}

async function init() {
  const lab = $("lab");
  if (!lab) return;
  const buttons = [...lab.querySelectorAll("button.signoff")];
  const select = (b) => { buttons.forEach((x) => x.classList.remove("primary")); b.classList.add("primary"); };
  buttons.forEach((b) => b.addEventListener("click", () => { select(b); decide(Number(b.dataset.n)); }));
  await ready();
  // Land on the headline state: 0 sign-offs, quorum unmet -> DENY.
  const zero = buttons.find((b) => b.dataset.n === "0");
  if (zero) { select(zero); decide(0); }
}

init();
