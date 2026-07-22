# Assessment validity

Evidence verdicts and artifact validity are separate. `validateAssessmentReceipt`
preserves a historical verdict while reporting whether the receipt currently
passes recognition rules. Its statuses include `valid`, invalid claim/evidence
binding, unknown policy, missing verifier identity, unauthorized verifier,
unsupported schema, and integrity failure. None maps to `Unsupported`,
`Contradicted`, or another evidentiary verdict.

Recognition checks bind the canonical claim hash, evidence root, frame hash,
resolved policy, verifier identity and authority, recognized schema, and
canonical receipt hash. Consumers must validate a receipt before treating its
verdict as usable. This checks artifact constitution, not whether reviewed
evidence was correct.
