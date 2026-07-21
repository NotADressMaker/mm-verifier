import { EDUCATION_DOMAINS, EDUCATION_LEVELS, EducationVerifyRequest } from './types';
export type EducationValidationResult = { value?: EducationVerifyRequest; errors: Array<{ field: string; message: string }> };
/** Accepts only the focused v1 education contract. Submitted text is processed ephemerally. */
export function validateEducationRequest(input: unknown): EducationValidationResult {
  const data = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>; const errors: EducationValidationResult['errors'] = [];
  const text = (field: string, required: boolean, max: number) => { const value = data[field]; if (required && (typeof value !== 'string' || !value.trim())) errors.push({ field, message: `${field} is required` }); else if (value !== undefined && (typeof value !== 'string' || value.length > max)) errors.push({ field, message: `${field} must be text up to ${max} characters` }); };
  text('aiResponse', true, 50000); text('prompt', false, 10000); text('subject', true, 100); text('curriculumStandard', false, 500);
  if (!EDUCATION_DOMAINS.includes(data.subject as typeof EDUCATION_DOMAINS[number])) errors.push({ field: 'subject', message: `subject must be one of: ${EDUCATION_DOMAINS.join(', ')}` });
  if (data.gradeLevel !== undefined && !EDUCATION_LEVELS.includes(data.gradeLevel as typeof EDUCATION_LEVELS[number])) errors.push({ field: 'gradeLevel', message: 'gradeLevel is invalid' });
  if (data.verificationMode !== undefined && data.verificationMode !== 'instructional') errors.push({ field: 'verificationMode', message: 'verificationMode must be instructional' });
  if (data.providedSources !== undefined && (!Array.isArray(data.providedSources) || data.providedSources.some(source => !source || typeof source !== 'object'))) errors.push({ field: 'providedSources', message: 'providedSources must be source objects' });
  return errors.length ? { errors } : { value: { ...data, verificationMode: 'instructional' } as EducationVerifyRequest, errors };
}
