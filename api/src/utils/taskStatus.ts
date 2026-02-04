export const TASK_STATUS_LABELS = [
  'open',
  'reveal-phase',
  'completed',
  'disputed',
  'resolved',
] as const;

const STATUS_ALIASES: Record<string, string> = {
  pending: 'open',
  commitphase: 'open',
  commit: 'open',
  open: 'open',
  revealphase: 'reveal-phase',
  reveal: 'reveal-phase',
  completed: 'completed',
  provisional: 'completed',
  disputed: 'disputed',
  resolved: 'resolved',
};

export function formatTaskStatus(state: number | bigint): string {
  const index = Number(state);
  return TASK_STATUS_LABELS[index] ?? 'unknown';
}

export function normalizeTaskStatusQuery(status?: string): string | undefined {
  if (!status) return undefined;
  const normalized = status.trim().toLowerCase().replace(/[_\s]+/g, '');
  return STATUS_ALIASES[normalized] ?? undefined;
}
