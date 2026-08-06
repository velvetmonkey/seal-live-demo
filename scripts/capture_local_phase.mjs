#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import fs from "node:fs";
import { isSynthetic, readProvenance } from "./provenance.mjs";

const [out, phase] = process.argv.slice(2);
if (!out || !phase) throw new Error("usage: capture_local_phase.mjs OUT PHASE");
const p = readProvenance();
if (!isSynthetic(p)) throw new Error("the local scripted runner requires tool_call.mode=synthetic");
let input = "";
for await (const chunk of process.stdin) input += chunk;
const receipt = JSON.parse(input);
const captured = {
  phase,
  tool_call_provenance: p.tool_call.mode,
  tool_call_generated_by: p.tool_call.generated_by,
  agent_emitted_call: false,
  receipt,
};
fs.writeFileSync(out, `${JSON.stringify(captured, null, 2)}\n`);
