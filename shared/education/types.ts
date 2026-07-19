import type { Verdict } from '../verdicts';

export const EDUCATION_MODES = ['student_answer', 'teacher_content', 'research_summary', 'exam_preparation'] as const;
export const EDUCATION_LEVELS = ['elementary', 'middle-school', 'high-school', 'undergraduate', 'graduate', 'adult-learning'] as const;
export const SUPPORT_LEVELS = ['Supported', 'Mostly supported', 'Mixed evidence', 'Unsupported', 'Contradicted', 'Unable to verify'] as const;
export const CLAIM_CLASSIFICATIONS = ['supported', 'partially_supported', 'disputed', 'unsupported', 'uncertain', 'not_evaluated'] as const;
export type EducationMode = typeof EDUCATION_MODES[number];
export type EducationLevel = typeof EDUCATION_LEVELS[number];
export type SupportLevel = Verdict;
export type ClaimClassification = typeof CLAIM_CLASSIFICATIONS[number];
export interface EducationSource { title?: string; url?: string; citation?: string; }
export interface EducationVerifyRequest {
  mode: EducationMode; question?: string; content: string; subject: string; education_level: EducationLevel;
  content_type: string; rubric?: string; learning_objectives?: string[]; provided_sources?: EducationSource[];
  privacy_acknowledged: true; options?: { extract_claims?: boolean; check_citations?: boolean; include_model_votes?: boolean };
}
export interface EducationClaim { id: string; text: string; classification: ClaimClassification; confidence: number; explanation: string; evidence: never[]; warnings: string[]; }
export type AssessmentStatus = 'high' | 'medium' | 'low' | 'format_checked' | 'not_assessed';
export interface VerificationDimensions {
  evidence_coverage: { assessed_claims: number; total_claims: number; percentage: number };
  source_reliability: { status: AssessmentStatus; detail: string };
  model_agreement: { agreeing_models: number; total_models: number; detail: string };
  source_independence: { status: AssessmentStatus; detail: string };
  recency: { status: AssessmentStatus; detail: string };
  contradictions: { count: number; severity: 'none' | 'minor' | 'material'; detail: string };
  receipt_integrity: { status: 'hash_verified' | 'unverified'; detail: string };
}
export interface EducationResult { support_level: SupportLevel; confidence_score: number; summary: string; claims: EducationClaim[]; verification_dimensions: VerificationDimensions; model_agreement: { agreement_score: number; votes: Array<{ provider: string; model: string; vote: string; score: number }>; outliers: string[] }; citation_review: { status: 'not_provided' | 'format_checked'; warnings: string[]; detected: string[] }; review_questions: string[]; warnings: string[]; limitations: string[]; demo_mode: boolean; }
