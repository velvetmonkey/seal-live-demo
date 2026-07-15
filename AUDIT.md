# IP audit & publish gate, seal-live-demo

PRIVATE preview. Ships only public artifacts. The verified core is the **pre-built,
sha256-pinned** seal kernel binary (the same audited artifact as seal-check); **no
seal-host / mcp-seal-dev source is vendored or referenced.** This file is the gate:
the checklist must pass before any public flip, which is a separate authorised step.

**Current status: PASS (private). NOT PUBLISHED.** No remote; no GitHub Pages.

## Pinned kernel binary
```
sha256(seal-gateway/wasm/seal.wasm) = d3067bc07e74977dedf6bb96d79a710c4b61143f6e8db151655bc88ece8b9d66
size = 3,666,978 bytes   (byte-identical copy under pwa/wasm/seal.wasm)
```
The gateway recomputes and verifies this on startup (`decide.cjs` → `verifyKernelSha`)
and fails closed on mismatch.

## What was NOT done (hard IP guardrails)
- Did **not** vendor or reference the private `seal-backchannel-demo` core
  (`seal-host/vendor/*`: the Rust `seal-v2-host` + Lean `libsealv2ffi.so`), nor the
  private `mcp-seal-dev` source. Those were inspected read-only for *interface/shape*
  only; none of their source or binaries are in this repo.
- The verified core here is the emscripten seal.wasm black-box, run in a Node host:
  not the private FFI binary.

## Checklist (must all hold to publish)
- [x] wasm sha256 matches pin (`sha256sum seal-gateway/wasm/seal.wasm`).
- [x] No private path / repo / commit / author leak in the binary or code, grep below
      is clean (docs that *name the boundary*, this file, README, excluded).
- [x] Embedded wasm strings are public-only (public `SealCore`/`SealV2` type names +
      Lean runtime; no `seal-host`/`mcp-seal-dev`/`wasm-spike`/paths). Inherited from
      the seal-check audit of the identical binary.
- [x] Node test harness (`test/local-harness.cjs`) is **TEST-ONLY**, not shipped
      runtime, clearly headered; the workflow never invokes it.
- [x] Synthetic data only (no PII): `prod_customer_ledger` rows are generated fakes.

## Re-run the audit
```sh
sha256sum seal-gateway/wasm/seal.wasm pwa/wasm/seal.wasm   # = d3067bc0 pin

# no private markers in code/config (exclude docs that intentionally name the boundary):
grep -rEni 'seal-host|seal_host|mcp-seal-dev|wasm-spike|monkey-01|/home/monkey|record.?core' \
  --exclude-dir=.git --exclude=AUDIT.md --exclude=README.md --binary-files=without-match . 
echo "exit=$?  (1 = clean / no matches)"

# no private markers in the binary:
strings -n 5 seal-gateway/wasm/seal.wasm | grep -Ei 'seal-host|mcp-seal-dev|wasm-spike|/home/|/Users/'
```

## Flip-public procedure (manual, separately authorised, NOT run here)
Out of scope for this build. When authorised by the owner: re-run the checklist;
create the PRIVATE GitHub repo; `git push`; run `workflow_dispatch` (GitHub Models
needs the runner token); re-verify the live report. Until then: private, no remote,
not published.
