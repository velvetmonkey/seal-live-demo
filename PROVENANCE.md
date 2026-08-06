# Run provenance is generated

[`provenance.json`](provenance.json) is the single machine-readable fact for the
shipped run. Its schema is [`provenance.schema.json`](provenance.schema.json).

Do not hand-write or hand-copy a claim about who produced the shipped tool-call,
which model was involved, where the run executed, its kernel pin, request
fingerprint, or bundle fingerprint. Hand-written provenance prose is a defect in
the same way as a hand-copied hash. Change the fact, then run:

```sh
node scripts/generate_provenance_surfaces.mjs
```

Generated regions are marked `provenance-generated`. The generator also checks
that the declared and actual bundle fingerprints match and fails on stale copy.
Run-specific GitHub Actions evidence uses an evidence-local fact created before
the run; the checked-in file remains the authority for the shipped replay.
