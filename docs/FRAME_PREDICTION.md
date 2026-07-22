# Conservative frame prediction

`predictUnderFrame` may reapply a registered threshold policy to a receipt's
recorded measurement vector when interpretation, evidence scope, verifier method,
and authority remain compatible. It returns `requires_reverification` for an
interpretation, evidence-selection, method, or authority change, and
`invalid_target_frame` for an unresolvable policy or invalid authority.

**This result re-applies declared rules to previously recorded measurements. It
does not gather new evidence or constitute a new verification receipt.** It does
not mutate, sign, or anchor the source receipt. Claim and evidence bindings stay
those of the source receipt; a caller requesting different bound content needs a
new assessment.
