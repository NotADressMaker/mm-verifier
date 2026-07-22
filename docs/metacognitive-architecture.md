# Metacognitive verification architecture

**Standing invariant.** Model agreement, model-stated confidence, and reasoning fluency are never evidence and never override `verdictFromEvidence()` or contradicted material claims. Evidentiary weight comes only from externally supported source kinds; `model_inference` has lower authority than retrieved, user-provided, policy, and external-tool evidence.

The existing hash-committed `ReasoningTraceCommitment` remains separate from the inspectable assessment: it can retain only a hash and an optional short summary while full trace content remains off-chain. `metacognitive_assessment` contains deliberately concise, reviewable summaries and must not be described as raw hidden reasoning or as a faithful record of latent computation.

The repository confirmation found the cited receipt, canonical hashing, pragmatics, possibility-space, verdict, genericity, dashboard, education, and configuration modules in place. `reasoningTrace.ts` currently uses unprefixed `REASONING_TRACE_*` variables (rather than the MAMV/MMV convention), so the new configuration follows the MAMV/MMV convention without changing that legacy flag. Genericity is already implemented under `verifier-node/src/verifiers/genericity`; this layer consumes its output rather than classifying wording again.

Evidence-source classification belongs in `shared/possibilitySpace.ts`, alongside the world/evidence-relation vocabulary that determines how evidence bears on a claim. The receipt imports these shared types, preserving one classification across possibility-aware and conventional verification. The grounding and communicability gates return established `VerificationBoundary` records and compose with, rather than replace, `verdictFromEvidence()`.
