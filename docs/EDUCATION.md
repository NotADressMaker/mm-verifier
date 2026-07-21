# Education Verification Mode

Education Verification Mode is a focused, deterministic vertical slice for reviewing an AI response as a set of claims. It is built for **epistemic literacy**: helping learners ask what a claim says, what evidence bears on it, what evidence standard is appropriate, what remains uncertain, and how another reasonable frame could change the conclusion.

It evaluates an assessment as `A(c | F)`: an evidence-conditioned assessment `A` of a claim `c` under a declared verification frame `F`. It does not determine absolute truth, assign a course grade, detect AI writing or plagiarism, accuse anyone of cheating, or make disciplinary decisions.

## Architecture and focused implementation

The Express API lives in `api/src/routes/v1`; education orchestration is in `api/src/services/educationVerification.ts`; portable hashing is shared through `shared/canonicalJson.ts`; the existing repository receipt architecture is extended with an education receipt payload. The React organization dashboard is available separately, but this first vertical slice deliberately returns a structured API report rather than adding persistence or a dashboard page. No migration is needed: submissions are processed ephemerally and only hashes appear in the receipt.

The pipeline is discrete and independently testable:

```text
AI response → atomic claim extraction → claim classification → frame construction
→ deterministic fixture evidence retrieval → relation classification → metrics
→ versioned policy verdict → instructional feedback → portable receipt
```

`shared/education/policy.ts` owns labels and thresholds. Changing its version or thresholds may change a verdict without changing the evidence relations or measurements.

## API

`POST /api/v1/education/verify` (the temporary `/v1/education/verify` alias also works).

```json
{
  "prompt": "Explain why seasons occur.",
  "aiResponse": "Earth's axial tilt causes seasons. Seasons occur because Earth is closer to the Sun in summer.",
  "subject": "science",
  "gradeLevel": "high-school",
  "verificationMode": "instructional",
  "curriculumStandard": null
}
```

The response includes `reportId`, claim assessments, multidimensional normalized (0–1) metrics, instructional feedback, reflection prompts, the entire report, and a receipt. A claim never receives a naked confidence score. `supported` means supported by reviewed evidence **in the frame**; `contradicted`, `insufficient_evidence`, `interpretation_dependent`, and `unable_to_verify` are distinct outcomes.

The initial retriever intentionally uses a local, deterministic teaching corpus for three fixture domains: late Roman history, seasons, and nuclear-energy policy. It does not contact external models or the web. This keeps tests reproducible but is a material limitation, visibly recorded in the frame and receipt.

## How to interpret a report

Metrics are separate measurements, not a truth probability: **claim clarity** records precision; **evidence coverage** records whether reviewed evidence bears on claims; **support/contradiction ratios** describe relation balance; **source quality** and **source independence** are separate; **logical consistency**, **counterargument coverage**, **unresolved ambiguity**, and **process reliability** describe the review process. Source count is never a substitute for source independence.

The receipt commits the original-response hash, claim hashes, frame hash, evidence manifest, program/policy versions, methods, timestamps, statuses, and limitations. Its hash preserves the assessment record; cryptographic or future on-chain anchoring does not prove a claim correct.

## Responsible assignment use

Use reports as a revision conversation: ask students to refine a claim, add an independent primary or course-approved source, state uncertainty, and compare another interpretation. Educators should review fixture limits, select an appropriate curriculum frame, and make all grading decisions themselves. This is not plagiarism detection, AI-content detection, source-count scoring, or automated assessment for high-stakes decisions.

## Example receipt outcome

For the request above, the axial-tilt claim is `supported` by the reviewed astronomy fixture. The distance claim is `contradicted` by reviewed evidence; feedback asks the learner to revise the causal explanation. The overall status is `mixed_evidence`, not a percentage. The receipt's `education.integrity_note` explicitly says hashes preserve the assessment record rather than proving the claims true.

## Recommended next iteration

Add educator-curated, versioned evidence packs and tenant-scoped report persistence; require source provenance before reporting quality/independence; then add an accessible dashboard report view showing text labels, relationships, limitations, metrics, feedback, prompts, and receipt integrity metadata without a single overall percentage.
