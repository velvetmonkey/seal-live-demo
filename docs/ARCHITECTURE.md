# Architecture

`seal-live-demo` is a replayable agent-threat demonstration.

## Components

- `seal-gateway/`: Node MCP gateway embedding the pinned wasm kernel and the database executor.
- `pwa/`: browser replay view for captured receipts and tamper checks.
- `scripts/run_local.sh`: local orchestration, assertions, and bundle generation.
- `test/local-harness.cjs`: fast local scenario harness.
- `scenarios/`: benign, attack, and control inputs.

## Data flow

1. The agent sends an MCP `db.execute` call to the gateway.
2. The gateway asks Seal for a decision.
3. On allow, the gateway executes against Postgres.
4. On block, the gateway emits a receipt and does not call the database.
5. The PWA replays receipts against the same pinned wasm artifact.

## Trust boundaries

The demo checks evidence for a fixed scenario. It does not prove GitHub Actions, Docker, Node, Postgres, the model, or the operator are correct.
