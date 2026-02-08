export type CheckerStatus = 'pass' | 'fail' | 'skipped';

export interface CheckerResult<T = Record<string, unknown>> {
  name: string;
  status: CheckerStatus;
  score_bps: number;
  findings: T;
  output_hash?: string;
}
