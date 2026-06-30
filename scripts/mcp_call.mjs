// SPDX-License-Identifier: Apache-2.0
// Minimal MCP Streamable-HTTP (JSON mode) client: initialize -> tools/call db.execute.
// Used by the connectivity probe and local verification; the agent ships its own
// client. Node 22 (global fetch). Usage:
//   node mcp_call.mjs --url http://seal-gateway:8800/mcp --operation insert \
//        --table staging_deploy_audit --payload '{"deploy_ref":"d-1"}'
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) { args[argv[i].slice(2)] = argv[i + 1]; i++; }
}
const url = args.url || process.env.MCP_URL || "http://seal-gateway:8800/mcp";
const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };

async function rpc(method, params, id) {
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  const text = await r.text();
  if (!text) return null;
  return JSON.parse(text);
}

(async () => {
  await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "mcp_call", version: "0" } }, 1);
  await fetch(url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  const res = await rpc("tools/call", {
    name: "db.execute",
    arguments: { operation: args.operation, table: args.table, payload: args.payload || "{}" },
  }, 2);
  const receipt = res?.result?.structuredContent;
  if (!receipt) { console.error("no receipt:", JSON.stringify(res)); process.exit(2); }
  console.log(JSON.stringify(receipt));
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
