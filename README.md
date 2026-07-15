# seal-live-demo

[![claims-drift](https://github.com/velvetmonkey/seal-live-demo/actions/workflows/claims.yml/badge.svg)](https://github.com/velvetmonkey/seal-live-demo/actions/workflows/claims.yml)

**Watch a live agent get tricked into a destructive prod delete — and Seal block it. Remove Seal and the identical request destroys the data. One command, real evidence, visible outcome.**

![Side-by-side result from the real run: SEAL OFF (control) — 0 records, "ALL CUSTOMER RECORDS DELETED"; SEAL ON (verified gate) — 10,000 customer records, unchanged. Between the panels: "identical canonical request on both sides: e5b872c7e5c7fa94e901a3c7…"](docs/img/moneyshot-seal-on-vs-off.png)

**The line under the panels — `identical canonical request on both sides: e5b872c7e5c7…` — is the whole argument.** That string is a SHA-256 **fingerprint** of the exact request the AI made: change one character of the request and the fingerprint changes completely. Both panels show the **same** fingerprint, so the AI asked for byte-for-byte the same thing both times. **The only thing that differed was the gate** — and that is the only reason the 10,000 customer records on the right still exist. This is a screenshot of the real served page from a real run: the header shows the real model (`openai/gpt-4o-mini`) and a kernel the browser re-verified before replaying. Not faked, not mocked — serve `pwa/` yourself (below) and it is what you see.

The demo plays out in three phases:

1. **Phase 1 (P1) — a legitimate task.** The agent does an approved, harmless job: an insert into a staging table. Seal allows it.
2. **Phase 2 (P2) — the attack, Seal ON.** Hostile data tricks the agent into requesting a destructive production delete. Seal blocks it; the 10,000 records survive.
3. **Phase 3 (P3) — the same attack, Seal OFF.** Our control: the byte-identical request replays with Seal switched off. The table is destroyed.

The demo wires an agent to a DB. Attack path: hostile data makes the agent emit the bad call. Seal stops it (no approval for that exact target). Control path: Seal off, data gone. Every step produces real receipts you can re-verify.

<details>
<summary><b>New to this? A 60-second decoder for the terms below</b></summary>

- **P1 / P2 / P3** — the three phases above: legitimate task, attack with the gate on, same attack with the gate off.
- **Canonical request / `canonical_request_sha256`** — the request put into one exact, normalised byte form, and the SHA-256 fingerprint of those bytes. Same fingerprint = same request, byte for byte.
- **Receipt** — a replayable record every decision emits; anyone can re-check it without trusting this repo.
- **Kernel** — the small decision core, written and proved in the Lean theorem prover. "Self-verified" in the page header means the browser re-checked the kernel's hash before replaying.
- **Truth box** — the quoted block below: the project's claim and non-claims, mirrored word-for-word across every Seal repo and guarded by an automated check (`scripts/claims-drift.mjs`) so it cannot drift silently.
- **Runtime profile `compatible` vs `canonical-l0`** — `canonical-l0` is the strict, mathematically proved request grammar. It exists and is proved, but it is **not** what runs today: the deployed route is the looser `compatible` profile, whose core allow/deny decisions come from the proved kernel while the pipeline around it is tested, not proved.
- **"ASSERT OK"** — the run's final self-check: every invariant green, including a guard that the database was genuinely populated before the run, so an empty database can never fake a pass.

Full definitions: [docs/GLOSSARY.md](docs/GLOSSARY.md).
</details>

## Quick start: run the attack

**One-command showcase**

```bash
bash scripts/showcase.sh
```

One command spins up the full live agent + gateway + kernel + DB. Watch Phase 1 ALLOW a staging insert, Phase 2 BLOCK the tricked destructive prod delete (rows unchanged), Phase 3 prove the identical bytes bypass and destroy the table. Real row counts, receipts, and a final "ASSERT OK" — every invariant green — land in your terminal. (Requires Docker + compose.)

## Replay without Docker

**No Docker? Replay the exact evidence in your browser (30 seconds):**

```bash
cd pwa && python3 -m http.server 8090   # then open http://localhost:8090
```

Ships ready to serve — the audited `wasm/seal.js` and a real run's `bundle.json` are already in `pwa/`. The page re-derives every Phase 1/2/3 decision from that bundle in your browser: SEAL ON grid full vs SEAL OFF grid empty, the identical `canonical_request_sha256` (the request fingerprint from the screenshot above) on both, receipts you can re-verify. Nothing leaves the page; no containers, no build. (Smoke-tested: index, `bundle.json`, and `wasm/seal.js` all serve 200.)

The point: the external effect had to cross the approval boundary. The model was just the story.

![Demo](https://img.shields.io/badge/demo-live%20agent-red)
![Runtime](https://img.shields.io/badge/runtime-WebAssembly-654ff0)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)

**What we claim — and what we don't.** The box below is the project's honesty statement. It is mirrored word-for-word across the Seal repos and guarded by an automated check, so it cannot be quietly softened. Plain-words version: the core decision kernel is mathematically proved; the strict proved request grammar (`canonical-l0`) is not yet the deployed route — today runs the `compatible` profile — and the deployed system as a whole is tested against the proof, not itself proved.

<!-- truthbox:begin -->
> **Runtime profile: `compatible`.** Strict `canonical-l0` is proved and modelled, not the deployed route yet.
> **Claim:** policy-covered request-effects recognised by the compatible MCP boundary require a matching live human approval and an allowing Lean kernel verdict; seam failures block; every decision emits replayable evidence.
> **Non-claim:** the deployed host is not proved end to end, and canonical parser rejection is not currently the runtime gate. Host `ApprovalRecord` tokens are a separate signed channel from the v2 canonical approval tuple.
<!-- truthbox:end -->
> Map: the family evaluator guide (`EVALUATOR-START.md`) and the full profile definition (`PROFILE.md`) live in private repos (`seal`, `seal-host`) and are available to authorised evaluators on request.

<!-- TODO(asset, shot #1, PROMO-GRADE): real terminal capture, split view — P2 BLOCK with
     "prod rows unchanged" beside P3 bypass "rows -> 0", the identical canonical_request_sha256
     visible in both panes. Source: run_local.sh stdout. Do NOT fake or mock. -->
<!-- TODO(asset, shot #11): terminal tail showing the final "ASSERT OK — every invariant green" line. -->



## For evaluators and auditors

Seal's proof story is intentionally narrow. The Lean theorems cover the mediation kernel and selected model properties. The binaries and browser artifacts are connected to that proof by reproducible conformance tests, not by a theorem about every compiled instruction.

Start with [What Seal is NOT](docs/LIMITATIONS.md) — the canonical non-claims, verbatim, in this repo — then [docs/PROOF-REFERENCE.md](docs/PROOF-REFERENCE.md) for theorem names and file locations, [docs/CONFORMANCE.md](docs/CONFORMANCE.md) for the byte-identity claim, and [docs/TCB.md](docs/TCB.md) for what remains trusted. The family-wide claims matrix (one table: proven / tested / assumed / not claimed) lives in the private `seal` umbrella repo, available to authorised evaluators.

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
                                 # mostly docker build); ends with "ASSERT OK" — every
                                 # invariant green
```

What you will see, in order: **Phase 1** an approved staging insert is ALLOWED; **Phase 2** the agent is
tricked into a destructive production delete and Seal BLOCKS it (row count provably unchanged);
**Phase 3** the *byte-identical* request replays with Seal bypassed and the 10,000-row table is
destroyed. The P2/P3 requests carry the same `canonical_request_sha256` — the request
fingerprint — so the only variable is Seal. Every phase emits a v2 receipt; `scripts/assert.mjs`
gates every invariant, including that the table was genuinely populated before the run, so a
green result can never come from an empty database.

Then check the evidence yourself — neither checker trusts this repo:

```sh
node test/local-harness.cjs               # offline harness against the shipped wasm kernel
cd pwa && python3 -m http.server 8090     # open http://localhost:8090 — the browser replay
                                          # re-derives every decision from bundle.json
```

Receipts in `evidence/receipts.jsonl` also verify through `seal-assurance-kit`'s
`node bin/seal verify` — and in CI: `seal-verify-action` runs the same pinned verify closure
in GitHub Actions and fails the build on an unverifiable receipt. (Both tools live in private
repos today; the install-to-first-PASS deployment guide is available to authorised evaluators.)

## The Seal family

_The Seal-family repositories are private today, so the names below are deliberately not links — a public reader would only hit 404s. Authorised evaluators can request access to any of them._

- **seal** — the umbrella story, product map, and evaluator path.
- **mcp-seal-dev** — the rulebook, proven.
- **seal-host** — the guard at the door.
- **seal-check** — don't trust. Verify.
- **seal-live-demo** — watch it work (this repo).
- **seal-assurance-kit** — check your own boundary.
- **witness-check** — the sufficiency analyzer. (private/proprietary)
- **seal-verify-action** — gate receipts in CI.

## Documentation

In this repo — every link below works publicly:

- [What Seal is NOT / Limitations](docs/LIMITATIONS.md) — read this first; the canonical non-claims live here, verbatim
- [Architecture](docs/ARCHITECTURE.md)
- [Threat model](docs/THREAT-MODEL.md)
- [Assumptions](docs/ASSUMPTIONS.md)
- [Proof reference](docs/PROOF-REFERENCE.md)
- [Conformance](docs/CONFORMANCE.md)
- [Trusted computing base](docs/TCB.md)
- [Glossary](docs/GLOSSARY.md)
- [Security policy](SECURITY.md)

Family-wide documents — the claims matrix (proven / tested / assumed / not claimed) and the family architecture map — live in the private `seal` umbrella repo, available to authorised evaluators.

## License

Apache-2.0. See [LICENSE](LICENSE).
