import { VerificationRun } from '../core/models';
export function markdownReport(run: VerificationRun): string {
  const lines = ['# MAMV OVP verification report', '', `- **OVP version:** ${run.ovp_version}`, `- **Run:** ${run.run_id}`, `- **Input hash:** ${run.input.hash}`, `- **Profile:** ${run.provenance.profile}`, `- **Timestamp:** ${run.provenance.timestamp}`, '', '## Claims'];
  lines.push(...run.claims.map((claim) => `- \`${claim.claim_id}\` (${claim.claim_type}): ${claim.text}`));
  lines.push('', '## Findings');
  lines.push(...(run.findings.length ? run.findings.map((finding) => `- **${finding.status}** (${finding.severity}; ${finding.checker.name}@${finding.checker.version}): ${finding.reason}`) : ['- No checker produced a finding. This is not evidence of support.']));
  if (run.provenance.checker_failures.length) lines.push('', '## Checker failures', ...run.provenance.checker_failures.map((failure) => `- ${failure.checker}: ${failure.message}`));
  return `${lines.join('\n')}\n`;
}
