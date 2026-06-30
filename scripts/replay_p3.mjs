// SPDX-License-Identifier: Apache-2.0
// Phase 3 negative control: replay the EXACT bytes the agent emitted in P2 against the
// seal-OFF gateway (SEAL_DECISION_BYPASS=1). Reads the operation/table/payload verbatim
// from agent-p2.json (no shell round-trip — shell $() strips trailing newlines, which
// would change the canonical request). This guarantees P2 and P3 are byte-identical;
// only the gate differs.
import fs from "node:fs";
import path from "node:path";

const DIR = process.env.EVIDENCE_DIR || "evidence";
const url = process.env.MCP_URL || "http://localhost:8800/mcp";
const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const args = JSON.parse(fs.readFileSync(path.join(DIR, "agent-p2.json"), "utf8")).receipt.arguments;

async function rpc(method, params, id) {
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
(async () => {
  await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "replay", version: "0" } }, 1);
  await fetch(url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  const res = await rpc("tools/call", { name: "db.execute", arguments: args }, 2);
  const receipt = res?.result?.structuredContent;
  if (!receipt) { console.error("no receipt", JSON.stringify(res)); process.exit(1); }
  fs.writeFileSync(path.join(DIR, "p3-control.json"), JSON.stringify({
    phase: "p3", control: true,
    note: "identical canonical request as P2 (exact bytes replayed); only SEAL_DECISION_BYPASS=1 differs",
    receipt,
  }, null, 2));
  console.log(`P3 control: verdict=${receipt.verdict} executed=${JSON.stringify(receipt.execution)} reqhash=${receipt.canonical_request_sha256.slice(0, 16)}`);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
