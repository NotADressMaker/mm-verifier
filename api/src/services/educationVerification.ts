import { hashCanonical, hashUtf8 } from '../../../shared/canonicalJson';
import { aggregateClaims, supportLevelForEvidence } from '../../../shared/education/scoring';
import { EducationClaim, EducationResult, EducationVerifyRequest, VerificationDimensions } from '../../../shared/education/types';

const sentenceSplit = (content: string) => content.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 15 && !/^(i think|in my opinion|this is (great|beautiful))/i.test(s));
function classify(text: string): EducationClaim['classification'] {
  if (/flat earth|seasons.*distance.*sun|photosynthesis.*oxygen.*soil/i.test(text)) return 'unsupported';
  if (/always|never|proves|guarantees|all students/i.test(text)) return 'uncertain';
  if (/however.*(but|whereas)|contradict|both .* and .*not/i.test(text)) return 'disputed';
  if (!/\b(is|are|was|were|causes?|occurs?|has|have|will|can)\b/i.test(text)) return 'not_evaluated';
  return 'supported';
}
function citations(content: string, sources: EducationVerifyRequest['provided_sources']) {
  const detected = content.match(/https?:\/\/[^\s)]+|10\.\d{4,9}\/[-._;()/:A-Z0-9]+|\[\d+\]|\([A-Z][A-Za-z]+,? \d{4}\)/gi) || [];
  const warnings: string[] = [];
  if (detected.length && !sources?.length) warnings.push('Citation-like references were detected, but no source details were supplied for review.');
  if (sources?.some(s => s.url && !/^https?:\/\//.test(s.url))) warnings.push('One or more source URLs are incomplete.');
  return { status: detected.length || sources?.length ? 'format_checked' as const : 'not_provided' as const, warnings, detected };
}
export function verifyEducation(request: EducationVerifyRequest) {
  const claims = sentenceSplit(request.content).slice(0, 12).map((text, index): EducationClaim => {
    const classification = classify(text); const confidence = classification === 'supported' ? .92 : classification === 'unsupported' ? .2 : classification === 'disputed' ? .35 : .5;
    return { id: `claim-${String(index + 1).padStart(2, '0')}-${hashUtf8(text).slice(2, 8)}`, text, classification, confidence, explanation: classification === 'supported' ? 'Demo cross-checkers did not identify a contradiction; this is not evidence that the claim is true.' : classification === 'not_evaluated' ? 'This statement is not a factual claim that this MVP can meaningfully check.' : 'This claim needs human review; this MVP does not retrieve authoritative sources.', evidence: [], warnings: classification === 'supported' ? [] : ['Review this claim against course-approved sources.'] };
  });
  const citation_review = citations(request.content, request.provided_sources);
  const baseScore = aggregateClaims(claims);
  const score = Math.max(0, Math.min(1, baseScore - citation_review.warnings.length * .05));
  const disagreement = claims.some(c => c.classification === 'disputed' || c.classification === 'uncertain');
  const votes = [{ provider: 'demo', model: 'mamv-education-crosscheck-a', vote: disagreement ? 'mixed' : 'support', score }, { provider: 'demo', model: 'mamv-education-crosscheck-b', vote: disagreement ? 'review' : 'support', score: disagreement ? .55 : .9 }];
  const assessedClaims = claims.filter(c => c.classification !== 'not_evaluated').length;
  const materialContradictions = claims.filter(c => c.classification === 'disputed').length;
  const agreeingModels = disagreement ? 1 : votes.length;
  const verification_dimensions: VerificationDimensions = {
    evidence_coverage: { assessed_claims: assessedClaims, total_claims: claims.length, percentage: claims.length ? Math.round((assessedClaims / claims.length) * 100) : 0 },
    source_reliability: { status: citation_review.status === 'format_checked' ? 'format_checked' : 'not_assessed', detail: citation_review.status === 'format_checked' ? 'Citation format was checked; source authority was not retrieved or evaluated.' : 'No source reliability assessment was performed.' },
    model_agreement: { agreeing_models: agreeingModels, total_models: votes.length, detail: disagreement ? 'Demo cross-checkers returned mixed signals.' : 'Demo cross-checkers returned matching signals.' },
    source_independence: { status: 'not_assessed', detail: 'Source independence cannot be established without retrieving and comparing source provenance.' },
    recency: { status: 'not_assessed', detail: 'Source publication and retrieval dates were not evaluated.' },
    contradictions: { count: materialContradictions, severity: materialContradictions ? 'material' : 'none', detail: materialContradictions ? 'Material claim conflicts require review.' : 'No material claim conflict was identified by this demo check.' },
    receipt_integrity: { status: 'hash_verified', detail: 'The receipt is deterministically hash-bound to this verification result; it is not independently signed.' },
  };
  const support_level = supportLevelForEvidence({
    supportedClaimRatio: claims.length ? claims.filter(c => c.classification === 'supported').length / claims.length : 0,
    contradictedClaimRatio: claims.length ? claims.filter(c => c.classification === 'unsupported' || c.classification === 'disputed').length / claims.length : 0,
    evidenceCoverage: 0, // Demo mode does not retrieve or review evidence.
    independentSupportCount: 0,
    hasMaterialContradiction: materialContradictions > 0,
  });
  const result: EducationResult = { support_level, confidence_score: Number(score.toFixed(2)), summary: `${claims.filter(c => c.classification === 'supported').length} of ${claims.length} extracted claims received stronger cross-checking signals. Review the dimensions below independently; model agreement is not proof of correctness.`, claims, verification_dimensions, model_agreement: { agreement_score: disagreement ? .58 : .9, votes, outliers: disagreement ? ['mamv-education-crosscheck-b'] : [] }, citation_review, review_questions: claims.filter(c => c.classification !== 'supported').map(c => `What course-approved source supports or challenges: “${c.text}”`).slice(0, 3), warnings: [...citation_review.warnings, ...(request.mode === 'teacher_content' && /answer key|correct answer/i.test(request.content) ? ['Check answer-key choices against each question before classroom use.'] : [])], limitations: ['Demo mode is deterministic and visibly simulated; it is not live model or source verification.', 'No authoritative source content was retrieved or reviewed.', 'MAMV provides evidence and confidence signals, not guarantees of truth, originality, fairness, or academic acceptability.'], demo_mode: true };
  const task_id = `edu_${hashUtf8(`${request.mode}:${request.content}`).slice(2, 18)}`;
  const receipt = { receipt_version: '1.0.0', receipt_id: hashCanonical({ task_id, score, input: hashUtf8(request.question || '') }), generated_at: new Date().toISOString(), task_id, input_hash: hashUtf8(request.question || ''), output_hash: hashUtf8(request.content), verification_status: result.support_level, confidence_score: score, education: { mode: request.mode, subject: request.subject, education_level: request.education_level, content_type: request.content_type, raw_content_persisted: false }, claim_summary: { total: claims.length, supported: claims.filter(c => c.classification === 'supported').length }, verification_dimensions: result.verification_dimensions, votes: result.model_agreement.votes, outliers: result.model_agreement.outliers, quorum_status: { met: result.model_agreement.agreement_score >= .67, participant_count: 2 }, warnings: result.warnings, limitations: result.limitations, signature_status: 'hash_only_not_signed', onchain_anchor: { anchor_status: 'not_anchored', disabled_for_education: true }, receipt_hash: hashCanonical({ task_id, result }) };
  return { task_id, status: 'completed' as const, education_result: result, receipt };
}
