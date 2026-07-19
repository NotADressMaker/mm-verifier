# Public verdict policy

MAMV verdicts describe the evidence reviewed in a particular verification run. They are **not statements of fact**, probability estimates, guarantees of correctness, safety, originality, fairness, or fitness for a use case. A verdict must link to the reviewed claims and evidence in its receipt; when it cannot, use **Unable to verify**.

## Required measurements

For each material claim, the verifier records whether reviewed evidence supports it, contradicts it, or is inconclusive. Claim weights are set by the verification program and disclosed in the evidence bundle. The verifier then calculates:

- **Evidence coverage:** weighted material claims with reviewed evidence / all weighted material claims.
- **Supported-claim ratio:** weighted assessed claims supported / all weighted assessed claims.
- **Contradicted-claim ratio:** weighted assessed claims contradicted / all weighted assessed claims.
- **Independent support count:** supporting sources or methods that do not share the same underlying source, provider, or provenance.
- **Material contradiction:** an unresolved conflict affecting a material claim. Model agreement alone is not evidence and does not count as independent support.

All ratios are in the inclusive range 0–1. These thresholds are policy thresholds, not calibrated probabilities.

## Verdicts and thresholds

The rules below are applied in order. The first matching rule is the verdict.

| Verdict | Explicit threshold | Required explanation |
| --- | --- | --- |
| **Unable to verify** | Evidence coverage is **below 0.50**, including when no material claim can be assessed. | State what evidence was unavailable or why claims could not be assessed. Do not infer support from missing evidence. |
| **Contradicted** | An unresolved material contradiction exists **and** contradicted-claim ratio is greater than supported-claim ratio. | Identify the material claim(s), the contradicting evidence, and any unresolved limitation. |
| **Mixed evidence** | An unresolved material contradiction exists, **or** both supported-claim ratio and contradicted-claim ratio are at least **0.25**. | Describe the evidence on both sides and why the conflict remains unresolved. |
| **Supported** | Evidence coverage is at least **0.50**; supported-claim ratio is at least **0.90**; at least **2** independent supporting sources/methods; and no unresolved material contradiction. | Name the coverage, support ratio, independent support count, and material limitations. Say “the reviewed evidence supports,” not “this is true.” |
| **Mostly supported** | Evidence coverage is at least **0.50**; supported-claim ratio is at least **0.75**; at least **1** independent supporting source/method; and no unresolved material contradiction. | Name remaining unassessed or inconclusive claims and avoid certainty language. |
| **Unsupported** | Evidence coverage is at least **0.50**, no prior rule applies, and there is no unresolved material contradiction that makes the result Mixed evidence or Contradicted. | State that reviewed evidence did not meet the support threshold; do not claim the proposition is false. |

## Explanation and presentation rules

1. Report the measurements used, the evidence scope, and material limitations beside the verdict.
2. Preserve claim-level evidence links or hashes in the receipt so a reader can reproduce the classification.
3. Do not substitute score, confidence, model agreement, quorum, signature status, or onchain anchoring for evidence coverage or independent support.
4. Do not use probability-like labels such as **Likely** as verdicts. Confidence may be reported separately as a score about the verification process, with its method and limitations.
5. A missing, malformed, inaccessible, or out-of-scope evidence bundle requires **Unable to verify** rather than a favorable verdict.

Legacy receipt labels (`Verified`, `Likely`, `Mixed`, `Unverified`, and `Risky`) are deprecated. New receipts must use the six verdicts above.
