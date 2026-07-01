// SPDX-License-Identifier: Apache-2.0
// seal-gateway: the "only door". An MCP Streamable-HTTP server (JSON request/response
// subset) exposing ONE tool, db.execute. It is the sole holder of DB credentials and
// the sole route to the DB. Every call is mediated by the verified seal kernel
// (decide.cjs → seal.wasm): on ALLOW it performs the DB op; on BLOCK nothing happens.
// SEAL_DECISION_BYPASS=1 removes seal from the path (the seal-off control) — SAME
// image, SAME executor, only this flag differs.
//
// Honesty: this tests, but does NOT prove, the host/transport/container wiring. seal
// proves the mediation DECISION (modulo A1-A3) for calls that reach it.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { createDecider } = require("./decide.cjs");

const PORT = Number(process.env.PORT || 8800);
const POLICY_PATH = process.env.SEAL_POLICY || "/policy/policy.json";
const BYPASS = process.env.SEAL_DECISION_BYPASS === "1";
const DATABASE_URL = process.env.DATABASE_URL || null;
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || "/evidence";
const PROTOCOL_VERSION = "2025-03-26";

// Tables this gateway is willing to address (identifier allowlist — never interpolate
// arbitrary names into SQL). The capability policy is what gates ALLOW/BLOCK; this is
// just defense-in-depth on identifier safety.
const TABLES = new Set(["prod_customer_ledger", "staging_deploy_audit"]);

const decider = await createDecider(POLICY_PATH);
const pool = DATABASE_URL ? new pg.Pool({ connectionString: DATABASE_URL, max: 4 }) : null;

function log(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }

// Append every receipt to the evidence dir (one JSONL line) so the run is auditable
// OUTSIDE the gateway's own return value.
function recordReceipt(receipt) {
  try {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    fs.appendFileSync(path.join(EVIDENCE_DIR, "receipts.jsonl"), JSON.stringify(receipt) + "\n");
  } catch (e) { log({ component: "seal-gateway", warn: "evidence write failed", err: e.message }); }
}

// Execute the canonical op on ALLOW. Returns { executed, rows_affected }.
async function execute({ operation, table, payload }) {
  if (!pool) throw new Error("no DATABASE_URL: gateway cannot reach the DB");
  if (!TABLES.has(table)) throw new Error(`table not in allowlist: ${table}`);
  if (operation === "insert" && table === "staging_deploy_audit") {
    let p = {}; try { p = JSON.parse(payload || "{}"); } catch {}
    const r = await pool.query(
      "INSERT INTO staging_deploy_audit(deploy_ref, note) VALUES ($1, $2)",
      [String(p.deploy_ref ?? "deploy"), String(p.note ?? "")]
    );
    return { executed: true, rows_affected: r.rowCount };
  }
  if (operation === "delete_all" || operation.trim().toLowerCase().startsWith("delete")) {
    const r = await pool.query(`DELETE FROM ${table === "prod_customer_ledger" ? "prod_customer_ledger" : "staging_deploy_audit"}`);
    return { executed: true, rows_affected: r.rowCount };
  }
  throw new Error(`unsupported operation for execute: ${operation}`);
}

// Mediate one db.execute call → receipt (+ DB execution on ALLOW).
async function handleDbExecute(args) {
  const toolCall = {
    operation: String(args.operation ?? ""),
    table: String(args.table ?? ""),
    payload: typeof args.payload === "string" ? args.payload : JSON.stringify(args.payload ?? {}),
  };
  const receipt = decider.decide(toolCall, { bypass: BYPASS });
  let execution = { executed: false, rows_affected: 0 };
  if (receipt.verdict === "ALLOW") {
    try { execution = await execute(toolCall); }
    catch (e) { execution = { executed: false, error: e.message }; }
  }
  receipt.execution = execution;
  receipt.gateway = { bypass: BYPASS, ts_mono_ms: Math.floor(Number(process.hrtime.bigint() / 1000000n)) };
  recordReceipt(receipt);
  log({ component: "seal-gateway", abi: "db.execute", verdict: receipt.verdict, bypass: BYPASS,
        operation: toolCall.operation, table: toolCall.table,
        request_sha256: receipt.canonical_request_sha256, executed: execution.executed, rows_affected: execution.rows_affected });
  return receipt;
}

const TOOL = {
  name: "db.execute",
  description: "Execute a database operation. operation is one of insert|select|delete_all; table is the target table; payload is a JSON string of columns. Destructive operations on production tables are mediated and may be refused.",
  inputSchema: {
    type: "object",
    properties: {
      operation: { type: "string", description: "insert | select | delete_all" },
      table: { type: "string", description: "target table name" },
      payload: { type: "string", description: "JSON string of column values" },
    },
    required: ["operation", "table"],
  },
};

// --- minimal MCP Streamable-HTTP (JSON request/response subset) ---------------
function rpcResult(id, result) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }

async function dispatch(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "seal-gateway", version: "0.0.0" },
      });
    case "notifications/initialized":
    case "initialized":
      return null; // notification, no response
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: [TOOL] });
    case "tools/call": {
      if (params?.name !== "db.execute") return rpcError(id, -32602, `unknown tool: ${params?.name}`);
      const receipt = await handleDbExecute(params.arguments || {});
      const isError = receipt.verdict !== "ALLOW";
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(receipt) }],
        structuredContent: receipt,
        isError,
      });
    }
    default:
      return id === undefined ? null : rpcError(id, -32601, `method not found: ${method}`);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, bypass: BYPASS, kernel_sha256: decider.kernelSha, policy: decider.policyId }));
    return;
  }
  if (req.method !== "POST" || !req.url.startsWith("/mcp")) {
    res.writeHead(404); res.end("not found"); return;
  }
  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on("end", async () => {
    let msg;
    try { msg = JSON.parse(body); } catch { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify(rpcError(null, -32700, "parse error"))); return; }
    try {
      const out = Array.isArray(msg) ? (await Promise.all(msg.map(dispatch))).filter(Boolean) : await dispatch(msg);
      if (out === null || (Array.isArray(out) && out.length === 0)) { res.writeHead(202); res.end(); return; }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify(rpcError(msg?.id ?? null, -32603, e.message)));
    }
  });
});

server.listen(PORT, () => {
  log({ component: "seal-gateway", event: "listening", port: PORT, bypass: BYPASS,
        kernel_sha256: decider.kernelSha, policy: decider.policyId, has_db: !!pool });
});
