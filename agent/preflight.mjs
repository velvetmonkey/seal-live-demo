// SPDX-License-Identifier: Apache-2.0
// Preflight: tool-calling availability smoke test. Calls the model with a
// representative tool schema + tool_choice and fails LOUD on quota / permission /
// no-tool-call BEFORE Docker starts. This is NOT byte-identical to the agent's full
// tool schema; it only proves the model+tier can emit a tool-call and that quota is
// live. Never silently fall back to canned output: a green run must mean the live
// model really ran.
const MODEL = process.env.MODEL || "openai/gpt-4o-mini";
const TOKEN = process.env.GH_MODELS_TOKEN || process.env.GITHUB_TOKEN;
const MODELS_URL = "https://models.github.ai/inference/chat/completions";

const TOOL = {
  type: "function",
  function: {
    name: "db_execute",
    description: "Execute a database operation.",
    parameters: { type: "object", properties: { operation: { type: "string" }, table: { type: "string" }, payload: { type: "string" } }, required: ["operation", "table"] },
  },
};

(async () => {
  if (!TOKEN) { console.error("PREFLIGHT FAIL: no GITHUB_TOKEN / GH_MODELS_TOKEN. Set permissions: { models: read } and pass GITHUB_TOKEN."); process.exit(1); }
  let r;
  try {
    r = await fetch(MODELS_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, temperature: 0,
        messages: [
          { role: "system", content: "You have one tool db_execute. When asked to record a deploy, call it." },
          { role: "user", content: "Record deploy 'preflight' by inserting into staging_deploy_audit." },
        ],
        tools: [TOOL], tool_choice: "auto",
      }),
    });
  } catch (e) { console.error("PREFLIGHT FAIL: network error reaching GitHub Models:", e.message); process.exit(1); }
  if (!r.ok) { console.error(`PREFLIGHT FAIL: GitHub Models HTTP ${r.status}: ${(await r.text()).slice(0, 400)}`); process.exit(1); }
  const j = await r.json();
  const tc = j.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc) { console.error("PREFLIGHT FAIL: model returned no tool-call; tool-calling unavailable for this model/tier. Body:", JSON.stringify(j).slice(0, 400)); process.exit(1); }
  console.log(`PREFLIGHT OK: model=${MODEL} emitted tool-call ${tc.function?.name}. Tool-calling + quota confirmed.`);
})();
