# IP audit & publish gate, seal-live-demo

PRIVATE preview. Ships only public artifacts. The decision core is the **pre-built,
sha256-pinned** seal kernel binary (the same pinned artifact as seal-check); **no
seal-host / mcp-seal-dev source is vendored**, though their names appear in shipped
comments and one wasm string (see the re-measured checklist). This file is the gate:
the checklist must pass before any public flip, which is a separate authorised step.

**Current status: NOT PUBLISHED — and the checklist does NOT currently pass; two
items below are red as re-measured 2026-08-08.** A private `origin` remote exists
and a `workflow_dispatch`-gated Pages deploy workflow (`.github/workflows/pages.yml`)
is present; neither has published the site.

## Pinned kernel binary
```
sha256(seal-gateway/wasm/seal.wasm) = 28bb3ae71985357163e3b651791e2a70c462ea5d1313a59b4967d4c20ea77657
size = 5,845,911 bytes   (byte-identical copy under pwa/wasm/seal.wasm)
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
- [ ] No private path / repo / commit / author leak in the binary or code — **RED,
      re-measured 2026-08-08**: the grep below returns matches (exit 0), including
      shipped runtime files `pwa/receipt.js`, `pwa/receipt-format.js`,
      `seal-gateway/receipt-format.js` and `test/receipt-format-unparseable.cjs`,
      which the stated doc exclusions do not cover.
- [ ] Embedded wasm strings are public-only — **RED, re-measured 2026-08-08**: the
      `strings` check below finds `seal-host: request refused` in the shipped binary.
- [x] Node test harness (`test/local-harness.cjs`) is **TEST-ONLY**, not shipped
      runtime, clearly headered; the workflow never invokes it.
- [x] Synthetic data only (no PII): `prod_customer_ledger` rows are generated fakes.

## Re-run the audit
```sh
sha256sum seal-gateway/wasm/seal.wasm pwa/wasm/seal.wasm   # = 28bb3ae7 pin

# no private markers in code/config (exclude docs that intentionally name the boundary):
grep -rEni 'seal-host|seal_host|mcp-seal-dev|wasm-spike|monkey-01|/home/monkey|record.?core' \
  --exclude-dir=.git --exclude=AUDIT.md --exclude=README.md --binary-files=without-match . 
echo "exit=$?  (1 = clean / no matches)"

# no private markers in the binary:
strings -n 5 seal-gateway/wasm/seal.wasm | grep -Ei 'seal-host|mcp-seal-dev|wasm-spike|/home/|/Users/'
```

## Flip-public procedure (manual, separately authorised, NOT run here)
Out of scope for this build. When authorised by the owner: re-run the checklist;
clear both red checklist items; push to the existing private remote; run
`workflow_dispatch` (GitHub Models needs the runner token); re-verify the live
report. Until then: private, not published.
