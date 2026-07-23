import type { VerificationClaimType } from '../types';

/** Education assessments describe reviewed evidence in a declared frame; they do not determine truth. */
export const EDUCATION_DOMAINS = ['history', 'science', 'civics', 'public-policy', 'literature', 'mathematics', 'general'] as const;
export const EDUCATION_LEVELS = ['elementary', 'middle-school', 'high-school', 'undergraduate', 'graduate', 'adult-learning'] as const;
export type EducationDomain = typeof EDUCATION_DOMAINS[number];
export type EducationLevel = typeof EDUCATION_LEVELS[number];
/** Pedagogical categories intentionally outside the canonical verification taxonomy. */
export type EducationOnlyClaimType = 'normative' | 'opinion' | 'procedural';
/** Education extends the canonical verification categories explicitly. */
export type EducationClaimType = VerificationClaimType | EducationOnlyClaimType;
/** Backwards-compatible education-local name. */
export type ClaimType = EducationClaimType;
export type ClaimAssessmentStatus = 'supported' | 'mostly_supported' | 'mixed_evidence' | 'contradicted' | 'unresolved' | 'insufficient_evidence' | 'interpretation_dependent' | 'outside_scope' | 'unable_to_verify';
export type EvidenceRelation = 'supports' | 'contradicts' | 'qualifies' | 'contextualizes' | 'duplicates' | 'inconclusive';

export interface EvidenceScope { sources: 'provided_and_curated_fixture'; temporalScope?: string; jurisdiction?: string; exclusions: string[]; }
export interface MethodManifest { extractor: string; classifier: string; evidenceRetriever: string; relationClassifier: string; metrics: string; }
export interface VerificationFrame { id: string; programId: string; programVersion: string; domain: EducationDomain; gradeLevel?: string; jurisdiction?: string; curriculumStandard?: string; interpretation?: string; assessmentTime: string; evidenceScope: EvidenceScope; policyVersion: string; methodManifest: MethodManifest; }
export interface AtomicClaim { id: string; responseId: string; text: string; canonicalForm?: { subject?: string; predicate?: string; object?: string; temporalScope?: string; geographicScope?: string; assumptions?: string[] }; claimType: ClaimType; verifiability: 'directly_verifiable' | 'partially_verifiable' | 'interpretation_dependent' | 'not_empirically_verifiable'; }
export interface ClaimEvidenceRelation { claimId: string; evidenceId: string; relation: EvidenceRelation; strength?: number; explanation: string; independenceCluster?: string; scopeMatch?: { semantic: boolean; temporal: boolean; jurisdictional: boolean }; }
export interface EducationalAssessmentMetrics { claimClarity: number; evidenceCoverage: number; supportRatio: number; contradictionRatio: number; sourceQuality: number; sourceIndependence: number; citationIntegrity?: number; logicalConsistency: number; temporalValidity?: number; counterargumentCoverage: number; unresolvedAmbiguity: number; processReliability: number; }
export interface EducationalFeedback { claimId?: string; category: 'claim_precision' | 'evidence_quality' | 'source_independence' | 'reasoning' | 'counterargument' | 'uncertainty' | 'citation' | 'revision'; severity: 'info' | 'suggestion' | 'warning'; message: string; suggestedAction?: string; }
export interface EducationEvidence { id: string; title: string; source: string; quality: number; independenceCluster: string; limitation?: string; }
export interface EducationVerdictPolicy { id: string; version: string; evaluate(metrics: EducationalAssessmentMetrics, claim: AtomicClaim, evidence: ClaimEvidenceRelation[]): ClaimAssessmentStatus; }
export interface EducationVerificationReport { id: string; responseId: string; verificationFrame: VerificationFrame; summary: { overallStatus: ClaimAssessmentStatus; totalClaims: number; supportedClaims: number; contradictedClaims: number; unresolvedClaims: number; interpretationDependentClaims: number; }; claims: Array<{ claim: AtomicClaim; assessment: { status: ClaimAssessmentStatus; explanation: string; evidentialStrength?: number; limitations: string[] }; evidenceRelations: ClaimEvidenceRelation[]; feedback: EducationalFeedback[] }>; metrics: EducationalAssessmentMetrics; reflectionPrompts: string[]; integrity: { claimSetHash?: string; frameHash?: string; evidenceRoot?: string; receiptHash?: string; }; }
export interface EducationVerifyRequest { prompt?: string; aiResponse?: string; subject: string; gradeLevel?: EducationLevel; verificationMode?: 'instructional'; curriculumStandard?: string | null; jurisdiction?: string; interpretation?: string; providedSources?: Array<{ title?: string; url?: string; citation?: string; independenceCluster?: string }>; }
export interface EducationVerifyResponse { reportId: string; overallStatus: ClaimAssessmentStatus; claims: EducationVerificationReport['claims']; metrics: EducationalAssessmentMetrics; feedback: EducationalFeedback[]; reflectionPrompts: string[]; receipt: Record<string, unknown>; report: EducationVerificationReport; }
