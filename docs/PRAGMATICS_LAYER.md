# Statement handling and reference consistency

MAMV records the **literal statement** in an answer separately from a clearly supported **implied statement**. They are independently checked and can receive different results. For example, “some employees were let go” records the literal statement and, when the ordinary scalar reading is clear, a separate “not all employees were let go” statement.

Statement classification runs **before world and claim generation**. This ensures that the possibility-aware pipeline receives separate claim records instead of trying to split a completed verdict. The conservative default is an assertion with no implied statement. Classification below **0.80** creates a limitation rather than silently choosing a reading.

* A quotation is checked for whether it accurately represents its stated source; that is separate from checking whether the quoted content is true.
* A hypothetical is not treated as an assertion of its antecedent.
* A hedge creates two records: the answer's disclosed uncertainty and the content being hedged.
* Rhetorical questions, figurative wording, and unclear sincerity receive a limitation unless a reliable literal statement is available.

Every evidence relationship has a basis: referential, inferential, contextual, conventional, or indexical. Indexical and conventional relationships include the resolution or convention used. Historic relations are displayed as `unspecified` rather than being retroactively guessed.

The receipt also records reference-consistency checks. Shared spelling alone does not establish that two mentions identify the same entity; ambiguous or conflicting references produce an unable-to-verify limitation until dates, affiliations, locations, or comparable distinguishing evidence is available.

## Verdict policy

Assertions and separately extracted literal/implied claims receive their own evidence verdicts. Quotations use quotation-accuracy labels; hypotheticals do not receive a verdict for their antecedent; hedge disclosure and hedged content remain independent. Any material ambiguous, conflicting, unresolved, or unresolved-indexical reference results in **Unable to verify** rather than a guessed result.
