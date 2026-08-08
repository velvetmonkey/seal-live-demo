// GENERATED from provenance.json by scripts/generate_provenance_surfaces.mjs. DO NOT EDIT.
export const PROVENANCE = {
  "$schema": "./provenance.schema.json",
  "schema_version": 1,
  "runner": "scripts/run_local.sh",
  "model": "local-synthetic (no GitHub Models)",
  "generated_by": "run_local.sh",
  "run_environment": "local",
  "commit": "8a26cfcc32013b41eb3ed4b3ceb51a328564d781",
  "tool_call": {
    "mode": "synthetic",
    "generated_by": "scripts/mcp_call.mjs"
  },
  "kernel": {
    "sha256": "28bb3ae71985357163e3b651791e2a70c462ea5d1313a59b4967d4c20ea77657"
  },
  "bundle": {
    "path": "pwa/bundle.json",
    "sha256": "e8c3044fb405e02fea3be98fe578d24d2a1b29858753139eb6597aa2f109b95f"
  },
  "request": {
    "sha256": "d4d7b5613cdb6abf0676daaa837de8aec1efd70940ed3feea4dee786857e1204"
  },
  "historical_capture": {
    "model": "openai/gpt-4o-mini",
    "kernel_sha256": "d3067bc07e74977dedf6bb96d79a710c4b61143f6e8db151655bc88ece8b9d66",
    "request_sha256": "e5b872c7e5c7fa94e901a3c7d642cc830157e339585aad24c2cceb761e759a02",
    "bundle_path": "archive/bundle-d3067bc0-historical.json",
    "runner": ".github/workflows/demo.yml",
    "run_environment": "github-actions",
    "tool_call_mode": "live"
  }
};
export const PROVENANCE_COPY = {
  "narration1": "The shipped run submits the hostile-data scenario's destructive bytes as a scripted tool-call; no model emitted them.",
  "narration3": "Same scripted request bytes, now with the verified gate: the deletion never reaches the database."
};
