# IP audit & publish gate, seal-live-demo

PUBLIC repository. The decision core is the **pre-built, sha256-pinned** seal kernel
binary (the same pinned artifact as seal-check); **no seal-host / mcp-seal-dev source
is vendored**, though their public repository names appear in shipped comments and one
wasm string. This file preserves the earlier IP audit and records its current meaning.

**Current status: SOURCE PUBLISHED; PAGES NOT DEPLOYED.** The public `origin` exists and
a manual Pages deploy workflow (`.github/workflows/pages.yml`) is present. The GitHub
Pages API returned 404 on 2026-08-12, so this audit does not claim a deployed site.

## Pinned kernel binary
```
sha256(seal-gateway/wasm/seal.wasm) = 28bb3ae71985357163e3b651791e2a70c462ea5d1313a59b4967d4c20ea77657
size = 5,845,911 bytes   (byte-identical copy under pwa/wasm/seal.wasm)
```
The gateway recomputes and verifies this on startup (`decide.cjs` → `verifyKernelSha`)
and fails closed on mismatch.

## What was NOT done (repository boundaries)
- Did **not** vendor the separate `seal-host` core (`seal-host/vendor/*`: the Rust
  `seal-v2-host` + Lean `libsealv2ffi.so`) or the public `mcp-seal-dev` source. None
  of those source trees or native binaries are in this repository.
- The verified core here is the emscripten seal.wasm black-box, run in a Node host:
  not the separate native FFI binary.

## Historical checklist (reinterpreted after publication)
- [x] wasm sha256 matches pin (`sha256sum seal-gateway/wasm/seal.wasm`).
- [ ] No sensitive path / commit / author leak in the binary or code — **RED,
      re-measured 2026-08-08**: the grep below returns matches (exit 0), including
      shipped runtime files `pwa/receipt.js`, `pwa/receipt-format.js`,
      `seal-gateway/receipt-format.js` and `test/receipt-format-unparseable.cjs`,
      which the stated doc exclusions do not cover.
- [x] Embedded wasm strings name only public repositories — `seal-host: request
      refused` names a public repository and is not a visibility leak.
- [x] Node test harness (`test/local-harness.cjs`) is **TEST-ONLY**, not shipped
      runtime, clearly headered; the workflow never invokes it.
- [x] Synthetic data only (no PII): `prod_customer_ledger` rows are generated fakes.

## Re-run the audit
```sh
sha256sum seal-gateway/wasm/seal.wasm pwa/wasm/seal.wasm   # = 28bb3ae7 pin

# inspect repository/path markers in code/config (exclude boundary documentation):
grep -rEni 'seal-host|seal_host|mcp-seal-dev|wasm-spike|monkey-01|/home/monkey|record.?core' \
  --exclude-dir=.git --exclude=AUDIT.md --exclude=README.md --binary-files=without-match . 
echo "exit=$?  (1 = clean / no matches)"

# inspect repository/path markers in the binary:
strings -n 5 seal-gateway/wasm/seal.wasm | grep -Ei 'seal-host|mcp-seal-dev|wasm-spike|/home/|/Users/'
```

## Publication state
The repository is public. Pages deployment remains a separate manual operator action;
run `workflow_dispatch` only when a live site is wanted, then re-verify the live report.
