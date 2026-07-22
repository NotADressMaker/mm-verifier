# Verifier attribution and authority

Every new assessment frame records `VerifierIdentity` (ID, type, version, and
optional organization or implementation hash) and `VerifierAuthority`. The
authority identifies allowed methods, claim/evidence types, jurisdiction scope,
validity period, prohibited assertions, and limitations. The verifier ID creates
answerability; it is not a trust score, independent evidence, or confidence.

`verifyInFrame` and receipt validity validation reject absent identity, identity
and authority mismatch, unauthorized methods or jurisdictions, and expired
authority. Current lightweight evaluation does not infer claim or evidence types
from prose; integrations must enforce any declared type limits before calling it.

## Economic accountability is not source truth

Receipts may link a verifier identity to its `VerifierRegistry`/`AuditorRegistry` record and a historical-accuracy record. Staking and slashing make specified dishonest or noncompliant conduct economically costly and make an accountable identity inspectable. They do **not** establish that a verifier's evidence sources are correct, make a signature independent evidence, or expand verifier authority.
