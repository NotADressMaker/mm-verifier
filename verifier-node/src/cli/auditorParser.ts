export type ListDisputesCommand = {
  kind: 'list-disputes';
  status?: string;
};

export type InspectCommand = {
  kind: 'inspect';
  disputeId: number;
  outFile?: string;
};

export type RunCommand = {
  kind: 'run';
  disputeId: number;
  program: string;
  bundle: string;
  bundleUri?: string;
  outFile?: string;
};

export type SubmitCommand = {
  kind: 'submit';
  disputeId: number;
  verdict: 'ACCEPT' | 'REJECT';
  scoreBps: number;
  evidenceHash: string;
  bundle?: string;
  rationaleHash?: string;
  dryRun: boolean;
};

export type AuditorCommand =
  | ListDisputesCommand
  | InspectCommand
  | RunCommand
  | SubmitCommand;

function getOption(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function parseDisputeId(value?: string): number {
  if (!value) {
    throw new Error('dispute id is required');
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`invalid dispute id: ${value}`);
  }
  return parsed;
}

export function parseAuditorArgs(args: string[]): AuditorCommand {
  const [command, ...rest] = args;

  switch (command) {
    case 'list-disputes': {
      return {
        kind: 'list-disputes',
        status: getOption(rest, '--status'),
      };
    }
    case 'inspect': {
      return {
        kind: 'inspect',
        disputeId: parseDisputeId(rest[0]),
        outFile: getOption(rest, '--out'),
      };
    }
    case 'run': {
      const disputeId = parseDisputeId(rest[0]);
      const program = getOption(rest, '--program');
      const bundle = getOption(rest, '--bundle');
      if (!program) {
        throw new Error('--program is required');
      }
      if (!bundle) {
        throw new Error('--bundle is required');
      }
      return {
        kind: 'run',
        disputeId,
        program,
        bundle,
        bundleUri: getOption(rest, '--bundle-uri'),
        outFile: getOption(rest, '--out'),
      };
    }
    case 'submit': {
      const disputeId = parseDisputeId(rest[0]);
      const verdictRaw = getOption(rest, '--verdict');
      const scoreRaw = getOption(rest, '--score-bps');
      const evidenceHash = getOption(rest, '--evidence-hash');
      if (!verdictRaw || (verdictRaw !== 'ACCEPT' && verdictRaw !== 'REJECT')) {
        throw new Error('--verdict must be ACCEPT or REJECT');
      }
      if (!scoreRaw) {
        throw new Error('--score-bps is required');
      }
      if (!evidenceHash) {
        throw new Error('--evidence-hash is required');
      }
      const bundle = getOption(rest, '--bundle');
      if (!bundle) {
        throw new Error('--bundle is required for submit');
      }
      const scoreBps = Number.parseInt(scoreRaw, 10);
      if (!Number.isFinite(scoreBps)) {
        throw new Error('score-bps must be a number');
      }
      return {
        kind: 'submit',
        disputeId,
        verdict: verdictRaw,
        scoreBps,
        evidenceHash,
        bundle,
        rationaleHash: getOption(rest, '--rationale-hash'),
        dryRun: hasFlag(rest, '--dry-run'),
      };
    }
    default:
      throw new Error(
        'Usage: mmv auditor <list-disputes|inspect|run|submit> [options]'
      );
  }
}
