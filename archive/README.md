# Archived evidence bundle — superseded kernel d3067bc0

`bundle-d3067bc0-historical.json` is the original `pwa/bundle.json` as captured
by a **real CI demo run** (`model: openai/gpt-4o-mini`, GitHub Models in the
loop) under the **now-superseded** kernel

    seal.wasm sha256 = d3067bc07e74977dedf6bb96d79a710c4b61143f6e8db151655bc88ece8b9d66

That build returned classify-default *passthrough* on a pathological JSON number
(`1e9999999999`) — a fail-OPEN mediation bypass. The fleet was repinned to the
fail-closed build

    seal.wasm sha256 = ff1bfd68d7be51b6a395f94dfc46b2fb27ed11dc5833af6a84675f42f9730546

on 2026-07-16, and then to the 7-kernel policy-bundle DX build

    seal.wasm sha256 = a37901811df4767fd08142243622b8372254e6ec5bd2d3aca18f0e61d0f109af

on 2026-07-17 (the fail-closed guard carries forward unchanged). Because
`pwa/receipt.js` cross-checks each replayed receipt's
`kernel_identity.wasm_sha256` against the on-disk wasm, the shipped
`pwa/bundle.json` is regenerated under each new kernel via
`scripts/run_local.sh` (a LOCAL, synthetic-agent run — real kernel/DB receipts,
scripted tool-calls, no GitHub Models). A real-CI re-capture under a3790181 is
queued post-merge and will replace the synthetic bundle (see README).

This file is retained UNMODIFIED as historical evidence of the d3067bc0 run. It
is not shipped or replayed by the PWA.
