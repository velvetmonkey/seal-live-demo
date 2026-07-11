# seal-live-demo

**Watch a live agent get tricked into a destructive prod delete — and Seal block it. Remove Seal and the identical request destroys the data. One command, real evidence, visible outcome.**

The demo wires an agent to a DB. Attack path: hostile data makes the agent emit the bad call. Seal stops it (no approval for that exact target). Control path: Seal off, data gone. Every step produces real receipts you can re-verify.

![Demo](https://img.shields.io/badge/demo-live%20agent-red)
![Runtime](https://img.shields.io/badge/runtime-WebAssembly-654ff0)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)

<!-- truthbox:begin -->
> **Runtime profile: `compatible`.** Strict `canonical-l0` is proved and modelled, not the deployed route yet.
> **Claim:** policy-covered request-effects recognised by the compatible MCP boundary require a matching live human approval and an allowing Lean kernel verdict; seam failures block; every decision emits replayable evidence.
> **Non-claim:** the deployed host is not proved end to end, and canonical parser rejection is not currently the runtime gate. Host `ApprovalRecord` tokens are a separate signed channel from the v2 canonical approval tuple.
<!-- truthbox:end -->
> Map: [EVALUATOR-START.md](https://github.com/velvetmonkey/seal/blob/main/EVALUATOR-START.md) · profile detail: [PROFILE.md](https://github.com/velvetmonkey/seal-host/blob/main/PROFILE.md) — both in private repos; the links resolve only for authorised evaluators.

**Luxury one-command showcase**

```bash
bash scripts/showcase.sh
```

(Delegates to run_local.sh if Docker available; else PWA + evidence print.) You will see attack **blocked** vs bypass succeed, same bytes, ASSERT style. Visible terminal outcome.

The point: the external effect had to cross the approval boundary. The model was just the story.

<!-- TODO(asset, shot #1, PROMO-GRADE): real terminal capture, split view — P2 BLOCK with
     "prod rows unchanged" beside P3 bypass "rows -> 0", the identical canonical_request_sha256
     visible in both panes. Source: run_local.sh stdout. Do NOT fake or mock. -->
<!-- TODO(asset, shot #2, PROMO-GRADE): PWA money-shot screenshot — SEAL ON grid full (10,000
     rows) vs SEAL OFF grid empty, counts + hash line visible. Source: pwa/index.html #moneyshot. -->
<!-- TODO(asset, shot #11): terminal tail showing "ASSERT OK: 15/15". -->



## For evaluators and auditors

Seal's proof story is intentionally narrow. The Lean theorems cover the mediation kernel and selected model properties. The binaries and browser artifacts are connected to that proof by reproducible conformance tests, not by a theorem about every compiled instruction.

Start with the family [claims matrix](https://github.com/velvetmonkey/seal/blob/main/docs/CLAIMS-MATRIX.md) (one table: proven / tested / assumed / not claimed) and [What Seal is NOT](https://github.com/velvetmonkey/seal-assurance-kit/blob/main/docs/WHAT-SEAL-IS-NOT.md), then [docs/PROOF-REFERENCE.md](docs/PROOF-REFERENCE.md) for theorem names and file locations, [docs/CONFORMANCE.md](docs/CONFORMANCE.md) for the byte-identity claim, and [docs/TCB.md](docs/TCB.md) for what remains trusted.

Mandatory non-claims:

<!-- claims:begin -->
- Seal proves properties of the mediation KERNEL, not of the whole deployed system.
- Seal does NOT prove SHA-256 collision resistance in Lean; it is a named, scoped cryptographic assumption (A-CR).
- The deployed Rust / wasm / JS are NOT proven bug-free; they are tied to the proof by byte-exact conformance testing over a corpus, not for every possible input.
- Seal guarantees AUTHORIZATION match, not INTENT match: if a human approves a malicious-but-valid request, Seal will execute it.
- Seal does NOT prevent compromise of hosts, browsers, build systems, keys, operators, or downstream tools.
- Seal's audit chain is tamper-EVIDENT, not tamper-IMPOSSIBLE.
- Seal does NOT make the AI smarter or prevent hallucinations; it stops an unapproved effect.
- Axiom footprint {propext, Classical.choice, Quot.sound} is the minimal classical fragment; no extra axioms.
<!-- claims:end -->

## Verify in five minutes

This is the Seal family's one canonical demo: one command, real containers, deterministic
outcome. **Prerequisites:** Docker with `docker compose`, and Node.js. No API keys — the local
run scripts the agent's tool call (`synthetic_agent: true`); the gateway, kernel, database,
receipts, and row counts are all real.

```sh
bash scripts/run_local.sh        # builds + runs the full P1/P2/P3 sequence (a few minutes,
                                 # mostly docker build); ends with "ASSERT OK: 15/15"
```

What you will see, in order: **P1** an approved staging insert is ALLOWED; **P2** the agent is
tricked into a destructive production delete and Seal BLOCKS it (row count provably unchanged);
**P3** the *byte-identical* request replays with Seal bypassed and the 10,000-row table is
destroyed. The P2/P3 requests carry the same `canonical_request_sha256` — the only variable is
Seal. Every phase emits a v2 receipt; `scripts/assert.mjs` gates all 15 invariants.

Then check the evidence yourself — neither checker trusts this repo:

```sh
node test/local-harness.cjs               # offline harness against the shipped wasm kernel
cd pwa && python3 -m http.server 8090     # open http://localhost:8090 — the browser replay
                                          # re-derives every decision from bundle.json
```

Receipts in `evidence/receipts.jsonl` also verify through `seal-assurance-kit`'s
`node bin/seal verify` — and in CI: `seal-verify-action` runs the same pinned verify closure
in GitHub Actions and fails the build on an unverifiable receipt (install-to-first-PASS guide:
[deployment guide](https://github.com/velvetmonkey/seal-assurance-kit/blob/main/docs/DEPLOYMENT.md)).

## The Seal family

_All Seal-family repositories are currently private; these links resolve only for authorised evaluators._

- [seal](https://github.com/velvetmonkey/seal): the private umbrella story, product map, and evaluator path.
- [mcp-seal-dev](https://github.com/velvetmonkey/mcp-seal-dev): The rulebook, proven.
- [seal-host](https://github.com/velvetmonkey/seal-host): The guard at the door.
- [seal-check](https://github.com/velvetmonkey/seal-check): Don't trust. Verify.
- [seal-live-demo](https://github.com/velvetmonkey/seal-live-demo): Watch it work.
- [seal-assurance-kit](https://github.com/velvetmonkey/seal-assurance-kit): Check your own boundary.
- [witness-check](https://github.com/velvetmonkey/witness-check): The sufficiency analyzer. (private/proprietary)
- [seal-verify-action](https://github.com/velvetmonkey/seal-verify-action): Gate receipts in CI.

## Documentation

- [What Seal is NOT](https://github.com/velvetmonkey/seal-assurance-kit/blob/main/docs/WHAT-SEAL-IS-NOT.md) — read this first (private kit repo)
- [Family claims matrix](https://github.com/velvetmonkey/seal/blob/main/docs/CLAIMS-MATRIX.md) · [family architecture map](https://github.com/velvetmonkey/seal/blob/main/docs/ARCHITECTURE.md) (private umbrella)
- [Architecture](docs/ARCHITECTURE.md)
- [Threat model](docs/THREAT-MODEL.md)
- [Assumptions](docs/ASSUMPTIONS.md)
- [Proof reference](docs/PROOF-REFERENCE.md)
- [Conformance](docs/CONFORMANCE.md)
- [Trusted computing base](docs/TCB.md)
- [Glossary](docs/GLOSSARY.md)
- [Limitations](docs/LIMITATIONS.md)
- [Security policy](SECURITY.md)

## License

Apache-2.0. See [LICENSE](LICENSE).
