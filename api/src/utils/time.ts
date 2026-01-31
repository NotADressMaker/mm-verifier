export function normalizeUnixSeconds(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }

  if (value > 1_000_000_000_000) {
    return Math.floor(value / 1000);
  }

  return Math.floor(value);
}

type CommitDeadlineParams = {
  nowSeconds: number;
  deadline?: number;
  commitDeadlineSeconds?: number;
};

export function resolveCommitDeadline(params: CommitDeadlineParams): number {
  if (params.deadline !== undefined) {
    return normalizeUnixSeconds(params.deadline, 'deadline');
  }

  if (params.commitDeadlineSeconds !== undefined) {
    return params.nowSeconds + params.commitDeadlineSeconds;
  }

  return params.nowSeconds + 3600;
}

type RevealDeadlineParams = {
  commitDeadline: number;
  revealDeadlineSeconds?: number;
};

export function resolveRevealDeadline(params: RevealDeadlineParams): number {
  if (params.revealDeadlineSeconds !== undefined) {
    return params.commitDeadline + params.revealDeadlineSeconds;
  }

  return params.commitDeadline + 3600;
}
