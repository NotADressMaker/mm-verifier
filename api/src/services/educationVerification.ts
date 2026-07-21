import { hashCanonical, hashUtf8 } from '../../../shared/canonicalJson';
import { defaultEducationVerdictPolicy } from '../../../shared/education/policy';
import {
  AtomicClaim,
  ClaimEvidenceRelation,
  EducationEvidence,
  EducationVerificationReport,
  EducationVerifyRequest,
  EducationalAssessmentMetrics,
  EducationalFeedback,
  VerificationFrame,
} from '../../../shared/education/types';

const clamp = (value: number) => Math.max(0, Math.min(1, Number(value.toFixed(2))));

const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(value => value.trim())
    .filter(value => value.length > 8)
    .slice(0, 12);

export function classifyClaim(text: string): Pick<AtomicClaim, 'claimType' | 'verifiability'> {
  if (/\b(should|ought|must|better|prefer)\b/i.test(text)) return { claimType: 'normative', verifiability: 'not_empirically_verifiable' };
  if (/\b(i think|in my opinion|beautiful|best)\b/i.test(text)) return { claimType: 'opinion', verifiability: 'not_empirically_verifiable' };
  if (/\b(may|will|likely|predict|future)\b/i.test(text)) return { claimType: 'predictive', verifiability: 'partially_verifiable' };
  if (/\b(primary cause|primarily because|caused|cause of|explains)\b/i.test(text)) return { claimType: 'causal', verifiability: 'partially_verifiable' };
  if (/\b(interprets?|shows that .* meant|arguably|significant)\b/i.test(text)) return { claimType: 'interpretive', verifiability: 'interpretation_dependent' };
  if (/\b(first|then|step|calculate|use)\b/i.test(text)) return { claimType: 'procedural', verifiability: 'partially_verifiable' };
  return { claimType: 'factual', verifiability: 'directly_verifiable' };
}

export function extractAtomicClaims(aiResponse: string, responseId: string): AtomicClaim[] {
  return sentences(aiResponse).map((text, index) => ({
    id: `claim_${index + 1}_${hashUtf8(text).slice(2, 10)}`,
    responseId,
    text,
    ...classifyClaim(text),
  }));
}

const fixtureEvidence: Record<string, EducationEvidence[]> = {
  history: [
    { id: 'hist-multi', title: 'Late Roman Empire: multiple interacting pressures', source: 'deterministic-history-fixture', quality: 0.9, independenceCluster: 'historical-synthesis' },
    { id: 'hist-lead', title: 'Lead poisoning remains a disputed hypothesis', source: 'deterministic-history-fixture', quality: 0.82, independenceCluster: 'historical-synthesis' },
  ],
  science: [
    { id: 'science-tilt', title: 'Seasons are caused by axial tilt and changing sunlight angle', source: 'deterministic-science-fixture', quality: 0.96, independenceCluster: 'astronomy-primary' },
    { id: 'science-distance', title: 'Distance from the Sun does not cause seasons', source: 'deterministic-science-fixture', quality: 0.96, independenceCluster: 'astronomy-primary' },
  ],
  civics: [
    { id: 'civics-tradeoff', title: 'Nuclear expansion involves evidence-conditioned trade-offs', source: 'deterministic-civics-fixture', quality: 0.82, independenceCluster: 'policy-review' },
  ],
  'public-policy': [
    { id: 'civics-tradeoff', title: 'Nuclear expansion involves evidence-conditioned trade-offs', source: 'deterministic-civics-fixture', quality: 0.82, independenceCluster: 'policy-review' },
  ],
  general: [],
  literature: [],
  mathematics: [],
};

export function classifyEvidenceRelations(claim: AtomicClaim, domain: string): ClaimEvidenceRelation[] {
  const lower = claim.text.toLowerCase();
  const evidence = fixtureEvidence[domain] || [];
  const make = (e: EducationEvidence, relation: ClaimEvidenceRelation['relation'], strength: number, explanation: string): ClaimEvidenceRelation => ({
    claimId: claim.id,
    evidenceId: e.id,
    relation,
    strength,
    explanation,
    independenceCluster: e.independenceCluster,
    scopeMatch: { semantic: true, temporal: true, jurisdictional: true },
  });

  if (/seasons?.*(distance|closer|farther).*sun|distance.*sun.*seasons?/i.test(lower)) {
    return [make(evidence.find(e => e.id === 'science-distance')!, 'contradicts', 0.95, 'Reviewed astronomy evidence identifies axial tilt rather than Earth–Sun distance as the cause of seasons.')];
  }
  if (/axial tilt|tilt.*earth|sunlight angle/i.test(lower)) {
    return [make(evidence.find(e => e.id === 'science-tilt')!, 'supports', 0.96, 'Reviewed astronomy evidence supports the axial-tilt explanation.')];
  }
  if (/lead poisoning/i.test(lower)) {
    return [make(evidence.find(e => e.id === 'hist-lead')!, 'qualifies', 0.7, 'Reviewed historical evidence treats lead poisoning as disputed rather than an established primary cause.')];
  }
  if (/roman empire.*(multiple|combination)|multiple.*(causes|pressures)/i.test(lower)) {
    return [make(evidence.find(e => e.id === 'hist-multi')!, 'supports', 0.84, 'Reviewed historical synthesis supports a multi-causal account.')];
  }
  if (claim.claimType === 'normative' || claim.claimType === 'opinion') {
    return [make(evidence[0]!, 'contextualizes', 0.6, 'Evidence can inform trade-offs but cannot settle this value judgment.')];
  }
  return [];
}

export function calculateMetrics(claim: AtomicClaim, relations: ClaimEvidenceRelation[]): EducationalAssessmentMetrics {
  const support = relations.filter(r => r.relation === 'supports').length;
  const contradict = relations.filter(r => r.relation === 'contradicts').length;
  const clusters = new Set(relations.filter(r => r.relation !== 'duplicates').map(r => r.independenceCluster));

  return {
    claimClarity: clamp(claim.text.length > 25 ? 0.8 : 0.55),
    evidenceCoverage: relations.length ? 1 : 0,
    supportRatio: relations.length ? clamp(support / relations.length) : 0,
    contradictionRatio: relations.length ? clamp(contradict / relations.length) : 0,
    sourceQuality: relations.length ? 0.86 : 0,
    sourceIndependence: clusters.size >= 1 ? 1 : 0,
    logicalConsistency: 1,
    temporalValidity: 1,
    counterargumentCoverage: relations.some(r => r.relation === 'qualifies' || r.relation === 'contradicts') ? 1 : 0,
    unresolvedAmbiguity: claim.verifiability === 'interpretation_dependent' ? 1 : 0,
    processReliability: 0.95,
  };
}

function feedback(claim: AtomicClaim, status: string, relations: ClaimEvidenceRelation[]): EducationalFeedback[] {
  const items: EducationalFeedback[] = [];
  if (status === 'contradicted') {
    items.push({
      claimId: claim.id,
      category: 'revision',
      severity: 'warning',
      message: 'This conclusion conflicts with reviewed evidence.',
      suggestedAction: 'Revise the causal explanation and explain why axial tilt, not distance, changes seasonal sunlight.',
    });
  }
  if (status === 'interpretation_dependent') {
    items.push({
      claimId: claim.id,
      category: 'uncertainty',
      severity: 'suggestion',
      message: 'The response presents one interpretation as settled fact.',
      suggestedAction: 'Name the interpretation and explain how another reasonable frame could change the conclusion.',
    });
  }
  if (status === 'unable_to_verify') {
    items.push({
      claimId: claim.id,
      category: 'reasoning',
      severity: 'info',
      message: 'This value judgment is not empirically verifiable by itself.',
      suggestedAction: 'State the value criterion and use evidence to discuss relevant trade-offs.',
    });
  }
  if (!relations.length) {
    items.push({
      claimId: claim.id,
      category: 'evidence_quality',
      severity: 'suggestion',
      message: 'This conclusion outruns the available reviewed evidence.',
      suggestedAction: 'Add a primary or course-approved source that independently bears on this precise claim.',
    });
  }
  return items;
}

function aggregateMetrics(items: EducationVerificationReport['claims']): EducationalAssessmentMetrics {
  const keys: Array<keyof EducationalAssessmentMetrics> = [
    'claimClarity',
    'evidenceCoverage',
    'supportRatio',
    'contradictionRatio',
    'sourceQuality',
    'sourceIndependence',
    'logicalConsistency',
    'temporalValidity',
    'counterargumentCoverage',
    'unresolvedAmbiguity',
    'processReliability',
  ];
  const all = items.map(item => calculateMetrics(item.claim, item.evidenceRelations));
  return Object.fromEntries(
    keys.map(key => [key, clamp(all.reduce((sum, metric) => sum + (metric[key] || 0), 0) / Math.max(all.length, 1))])
  ) as unknown as EducationalAssessmentMetrics;
}

export function verifyEducation(request: EducationVerifyRequest) {
  const aiResponse = request.aiResponse!;
  const responseId = `response_${hashUtf8(aiResponse).slice(2, 14)}`;
  const claims = extractAtomicClaims(aiResponse, responseId);

  const frame: VerificationFrame = {
    id: `frame_${hashUtf8(`${request.subject}:${request.gradeLevel || ''}`).slice(2, 12)}`,
    programId: 'education-verification',
    programVersion: '1.0.0',
    domain: request.subject as VerificationFrame['domain'],
    gradeLevel: request.gradeLevel,
    jurisdiction: request.jurisdiction,
    curriculumStandard: request.curriculumStandard || undefined,
    interpretation: request.interpretation,
    // Fixed rather than wall-clock so identical requests hash to identical receipts (see EDUCATION.md).
    assessmentTime: new Date(0).toISOString(),
    evidenceScope: {
      sources: 'provided_and_curated_fixture',
      exclusions: ['No live web retrieval; fixture evidence is a deterministic local teaching corpus.'],
    },
    policyVersion: defaultEducationVerdictPolicy.version,
    methodManifest: {
      extractor: 'deterministic-sentence-v1',
      classifier: 'deterministic-rules-v1',
      evidenceRetriever: 'curated-fixtures-v1',
      relationClassifier: 'deterministic-rules-v1',
      metrics: 'education-metrics-v1',
    },
  };

  const reportClaims = claims.map(claim => {
    const relations = classifyEvidenceRelations(claim, frame.domain);
    const metrics = calculateMetrics(claim, relations);
    const status = defaultEducationVerdictPolicy.evaluate(metrics, claim, relations);
    const explanation =
      status === 'supported' ? 'Supported by reviewed evidence in the declared frame.'
      : status === 'contradicted' ? 'Contradicted by reviewed evidence in the declared frame.'
      : status === 'interpretation_dependent' ? 'Assessment depends on the declared interpretation.'
      : status === 'unable_to_verify' ? 'Unable to verify empirically in this frame.'
      : 'Insufficient reviewed evidence for a stronger assessment.';

    return {
      claim,
      assessment: {
        status,
        explanation,
        evidentialStrength: relations.length ? Math.max(...relations.map(r => r.strength || 0)) : undefined,
        limitations: frame.evidenceScope.exclusions,
      },
      evidenceRelations: relations,
      feedback: feedback(claim, status, relations),
    };
  });

  const metrics = aggregateMetrics(reportClaims);
  const statuses = reportClaims.map(item => item.assessment.status);
  const overallStatus =
    statuses.includes('contradicted') ? 'mixed_evidence'
    : statuses.includes('interpretation_dependent') ? 'interpretation_dependent'
    : statuses.includes('unable_to_verify') ? 'unable_to_verify'
    : statuses.includes('insufficient_evidence') ? 'insufficient_evidence'
    : statuses.includes('supported') ? 'supported'
    : 'unresolved';

  const report: EducationVerificationReport = {
    id: `edu_report_${hashUtf8(`${request.subject}:${aiResponse}`).slice(2, 16)}`,
    responseId,
    verificationFrame: frame,
    summary: {
      overallStatus,
      totalClaims: reportClaims.length,
      supportedClaims: statuses.filter(s => s === 'supported' || s === 'mostly_supported').length,
      contradictedClaims: statuses.filter(s => s === 'contradicted').length,
      unresolvedClaims: statuses.filter(s => s === 'unresolved' || s === 'insufficient_evidence' || s === 'unable_to_verify').length,
      interpretationDependentClaims: statuses.filter(s => s === 'interpretation_dependent').length,
    },
    claims: reportClaims,
    metrics,
    reflectionPrompts: [
      'Which claim has the weakest support in this frame?',
      'What evidence would most change your conclusion?',
      'What uncertainty should be stated explicitly?',
    ],
    integrity: {},
  };

  const evidenceManifest = reportClaims.flatMap(item =>
    item.evidenceRelations.map(relation => ({
      evidenceId: relation.evidenceId,
      relation: relation.relation,
      independenceCluster: relation.independenceCluster,
    }))
  );
  report.integrity = {
    claimSetHash: hashCanonical(claims),
    frameHash: hashCanonical(frame),
    evidenceRoot: hashCanonical(evidenceManifest),
  };

  const receipt = {
    receipt_version: '1.0.0',
    receipt_id: report.id,
    task_id: report.id,
    generated_at: frame.assessmentTime,
    input_hash: hashUtf8(request.prompt || ''),
    output_hash: hashUtf8(aiResponse),
    verification_status: overallStatus,
    program: { id: frame.programId, version: frame.programVersion },
    education: {
      verification_frame: frame,
      claim_hashes: claims.map(claim => hashCanonical(claim)),
      evidence_manifest: evidenceManifest,
      assessment_statuses: statuses,
      limitations: frame.evidenceScope.exclusions,
      integrity_note: 'Hashes preserve this assessment record; they do not prove claims are true.',
    },
  };
  const receiptHash = hashCanonical(receipt);
  report.integrity.receiptHash = receiptHash;

  return {
    reportId: report.id,
    overallStatus,
    claims: reportClaims,
    metrics,
    feedback: reportClaims.flatMap(item => item.feedback),
    reflectionPrompts: report.reflectionPrompts,
    receipt: { ...receipt, receipt_hash: receiptHash },
    report,
  };
}
