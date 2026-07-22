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
