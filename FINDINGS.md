# seal-live-demo — Claim Audit Findings

Sampled from README, "What happens", "Run it now", non-claims, evidence/.

Backed by: scripts/run_local.sh + assert.mjs (17 invariants), evidence/, pwa replay, scenarios/.

All "block vs bypass on identical bytes", "ASSERT OK", "real receipts" preserved.

## Sampled

| Claim | Backed? | Evidence | Action |
|-------|---------|----------|--------|
| Live-agent demo: Seal blocks unapproved destructive call; same request succeeds when bypassed. | Yes (runnable + asserted) | scripts/run_local.sh + assert.mjs (P2 block vs P3), scenarios/p2_attack, evidence/ | keep |
| Ends with ASSERT OK: 15/15. Byte-identical requests. | Yes (tested) | assert.mjs + run output | keep |
| PWA replay re-derives from committed bundle, no containers. | Yes | pwa/ + evidence/ | keep |
| Proves kernel rules; deployed tied by conformance. | Yes (documented) | non-claims + family | keep |

## NEEDS BEN
- Docker run in env (static evidence + assert source + prior captures suffice).

See evidence/summary.md + family matrix.