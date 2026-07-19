import { EDUCATION_LEVELS, EDUCATION_MODES, EducationVerifyRequest } from './types';
export type EducationValidationResult = { value?: EducationVerifyRequest; errors: Array<{ field: string; message: string }> };
export function validateEducationRequest(input: unknown): EducationValidationResult {
  const data = input as Record<string, unknown>; const errors: EducationValidationResult['errors'] = [];
  const text = (name: string, required = false, max = 10000) => { const v = data[name]; if (required && (typeof v !== 'string' || !v.trim())) errors.push({ field: name, message: `${name} is required` }); else if (v !== undefined && (typeof v !== 'string' || v.length > max)) errors.push({ field: name, message: `${name} must be text up to ${max} characters` }); };
  text('content', true, 50000); text('subject', true, 100); text('content_type', true, 100); text('question', false, 10000); text('rubric', false, 10000);
  if (!EDUCATION_MODES.includes(data.mode as EducationVerifyRequest['mode'])) errors.push({ field: 'mode', message: 'mode is invalid' });
  if (!EDUCATION_LEVELS.includes(data.education_level as EducationVerifyRequest['education_level'])) errors.push({ field: 'education_level', message: 'education_level is invalid' });
  if (data.privacy_acknowledged !== true) errors.push({ field: 'privacy_acknowledged', message: 'privacy acknowledgment is required' });
  if (data.learning_objectives !== undefined && (!Array.isArray(data.learning_objectives) || data.learning_objectives.some(v => typeof v !== 'string' || v.length > 500))) errors.push({ field: 'learning_objectives', message: 'learning_objectives must be short text entries' });
  if (data.provided_sources !== undefined && (!Array.isArray(data.provided_sources) || data.provided_sources.some(v => !v || typeof v !== 'object' || (!('url' in v) && !('citation' in v) && !('title' in v))))) errors.push({ field: 'provided_sources', message: 'provided_sources entries need a title, URL, or citation' });
  return errors.length ? { errors } : { value: data as unknown as EducationVerifyRequest, errors };
}
