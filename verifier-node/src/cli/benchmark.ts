import path from 'path';
import { runBenchmark } from '../benchmark/runner';

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = args[i + 1];
    parsed[key] = value;
    i += 1;
  }
  return parsed;
}

export async function runBenchmarkCli(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  const bundlesPath = parsed.bundles ?? path.join(process.cwd(), 'benchmarks', 'bundles');
  const outDir = parsed.out ?? path.join(process.cwd(), 'out');
  const tasksPath = parsed.tasks ?? path.join(process.cwd(), 'benchmarks', 'tasks.jsonl');
  const groundTruthPath =
    parsed.groundTruth ?? path.join(process.cwd(), 'benchmarks', 'ground_truth.jsonl');

  await runBenchmark({
    bundlesPath,
    outDir,
    tasksPath,
    groundTruthPath,
    program: parsed.program,
  });

  process.stdout.write(`Benchmark complete. Output written to ${outDir}\n`);
}
