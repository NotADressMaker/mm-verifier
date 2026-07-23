import { VerificationRun } from '../core/models';
export function jsonReport(run: VerificationRun): string { return `${JSON.stringify(run, null, 2)}\n`; }
