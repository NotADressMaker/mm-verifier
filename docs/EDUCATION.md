# MAMV Education MVP

MAMV Education is a privacy-conscious review flow for AI-assisted student answers and teaching material. It provides evidence and confidence signals, **not** guarantees that work is true, original, fair, pedagogically appropriate, or academically acceptable.

## Workflows and API

`POST /v1/education/verify` supports `student_answer`, `teacher_content`, `research_summary`, and `exam_preparation`. It processes content ephemerally: the education receipt contains hashes, not submitted text, and education anchoring is disabled by default. Demo mode is deterministic and explicitly reported as simulated.

```json
{"mode":"student_answer","question":"Why do seasons occur?","content":"Earth's axial tilt causes seasons.","subject":"earth-science","education_level":"middle-school","content_type":"answer","privacy_acknowledged":true}
```

The response includes extracted claims, configurable MVP support thresholds, model-vote signals, citation-format warnings, review questions, an **epistemic-literacy** section, and a hash-only receipt. Citation review detects formatting only; it neither retrieves nor validates source content.

## From informational relativity to epistemic literacy

MAMV treats an assessment as relative to a declared verification frame: its interpretation, evidence scope, policy, method, and time. The resulting measurements are kept distinct from the policy that turns them into a verdict. This makes the conditions for knowledge assessment inspectable rather than presenting an answer as context-free certainty.

In the education flow, that idea becomes a small, visible reasoning-process assessment. The `epistemic_literacy` result records whether the submitted work visibly contains a checkable claim, an evidence connection, a qualification or condition, and an alternative explanation. It also returns concrete next steps for missing practices. These are prompts for student reflection and educator review—not a score for correctness, a grade, or an inference about private chain-of-thought.

The same process indicators are embedded in the trust receipt alongside verification dimensions. A recipient can therefore inspect what was evaluated, which reasoning practices were visible, and the limits of the assessment without storing the submitted content itself.

## Privacy and deployment

Never submit student names, IDs, grades, school names, contact details, disability information, or other protected records. Production deployments require independent legal, security, retention, and institutional-policy review; this MVP makes no FERPA, COPPA, GDPR, or other compliance claim. Set `EDUCATION_MAX_PAYLOAD` to limit requests. API keys remain server-side.

## Architecture, limitations, and future work

The route validates shared education schemas, runs provider-neutral deterministic claim extraction, transforms results into an education receipt, and returns the receipt to the React dashboard. It intentionally does not grade, detect plagiarism or AI writing, make integrity judgments, retrieve authoritative evidence, or determine bias/accessibility/legal compliance. Future integrations may use LTI with LMS platforms after privacy, identity, and consent design.
