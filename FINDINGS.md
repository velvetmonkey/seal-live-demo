# seal-live-demo — Claim Audit Findings

Sampled from README, "What happens", "Run it now", non-claims, evidence/.

Backed by: scripts/run_local.sh + assert.mjs (invariant count computed at run time), evidence/, pwa replay, scenarios/.

All "block vs bypass on identical bytes", "ASSERT OK", "real receipts" preserved.

## Sampled

| Claim | Backed? | Evidence | Action |
|-------|---------|----------|--------|
<!-- provenance-generated:sampled-run:begin -->
| Scripted-tool-call demo: Seal blocks the destructive call; the same request succeeds when bypassed. | Yes (runnable + asserted) | `scripts/run_local.sh` + assert.mjs (P2 block vs P3), scenarios/p2_attack, evidence/ | keep |
<!-- provenance-generated:sampled-run:end -->
| Ends with ASSERT OK, count computed at run time. Byte-identical requests. | Yes (tested; re-executed 2026-08-08: `bash scripts/run_local.sh` → ASSERT OK: 19/19, exit 0 — the count grew from 17 when commit 8994746 added two provenance invariants) | assert.mjs + run output | keep |
| PWA replay re-derives from committed bundle, no containers. | Yes | pwa/ + evidence/ | keep |
| Proves kernel rules; deployed tied by conformance. | Yes (documented) | non-claims + family | keep |

## NEEDS BEN
- Docker run in env (static evidence + assert source + prior captures suffice).

See evidence/summary.md + family matrix.
