import fs from 'fs/promises';
import path from 'path';
import { EvidenceBundle } from '../../../shared/types';
import {
  CalibrationPoint,
  computeBrierScore,
  computeCalibrationBins,
  computeExpectedCalibrationError,
} from './metrics';
import {
  computeAgreementMetrics,
  computeErrorCorrelation,
  clusterOutputs,
} from './agreement';

type BenchmarkTask = {
  task_id: string;
  prompt: string;
  expected_answer: string;
  category: string;
};

type GroundTruth = {
  task_id: string;
  expected_verdict: boolean;
  category: string;
};

export interface BenchmarkRunOptions {
  bundlesPath: string;
  outDir: string;
  tasksPath: string;
  groundTruthPath: string;
  program?: string;
}

async function loadJsonl<T>(filePath: string): Promise<T[]> {
  const content = await fs.readFile(filePath, 'utf8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

export async function runBenchmark(options: BenchmarkRunOptions): Promise<void> {
  const tasks = await loadJsonl<BenchmarkTask>(options.tasksPath);
  const groundTruth = await loadJsonl<GroundTruth>(options.groundTruthPath);
  const groundTruthMap = new Map(groundTruth.map((entry) => [entry.task_id, entry]));

  const bundleFiles = (await fs.readdir(options.bundlesPath)).filter((file) =>
    file.endsWith('.json')
  );

  const calibrationPoints: CalibrationPoint[] = [];
  const agreementSummaries: Array<Record<string, unknown>> = [];
  const failureModes: Array<Record<string, unknown>> = [];
  const modelOutcomes: Record<string, boolean[]> = {};
  const confusionByCategory: Record<
    string,
    { total: number; correct: number; predicted_pass: number; predicted_fail: number }
  > = {};

  for (const file of bundleFiles) {
    const bundlePath = path.join(options.bundlesPath, file);
    const bundle = JSON.parse(await fs.readFile(bundlePath, 'utf8')) as EvidenceBundle;
    const truth = groundTruthMap.get(String(bundle.task_id));
    if (!truth) continue;

    const predictedScore = Math.max(0, Math.min(1, bundle.final_score_bps / 10000));
    calibrationPoints.push({ predicted: predictedScore, actual: truth.expected_verdict });

    const outputs = bundle.model_runs.map((run) => run.raw_output ?? '');
    const agreement = computeAgreementMetrics(outputs);
    agreementSummaries.push({
      task_id: bundle.task_id,
      agreement_rate: agreement.agreement_rate,
      pairwise_agreement: agreement.pairwise_agreement,
      majority_margin: agreement.majority_margin,
      entropy: agreement.entropy,
      clusters: agreement.clusters.length,
    });

    if (!truth.expected_verdict) {
      const clusters = clusterOutputs(outputs);
      const repeated = clusters.filter((cluster) => cluster.count > 1);
      if (repeated.length > 0) {
        failureModes.push({
          task_id: bundle.task_id,
          category: truth.category,
          clusters: repeated.map((cluster) => ({
            fingerprint: cluster.fingerprint,
            count: cluster.count,
            sample: cluster.sample,
          })),
        });
      }
    }

    const predictedPass = bundle.final_score_bps >= 5000;
    const stats = confusionByCategory[truth.category] ?? {
      total: 0,
      correct: 0,
      predicted_pass: 0,
      predicted_fail: 0,
    };
    stats.total += 1;
    if (predictedPass) stats.predicted_pass += 1;
    else stats.predicted_fail += 1;
    if (predictedPass === truth.expected_verdict) stats.correct += 1;
    confusionByCategory[truth.category] = stats;

    for (const run of bundle.model_runs) {
      const key = `${run.provider}:${run.model}`;
      if (!modelOutcomes[key]) {
        modelOutcomes[key] = [];
      }
      modelOutcomes[key].push(truth.expected_verdict);
    }
  }

  const bins = computeCalibrationBins(calibrationPoints);
  const ece = computeExpectedCalibrationError(bins);
  const brier = computeBrierScore(calibrationPoints);
  const accuracy =
    calibrationPoints.filter((point) => (point.predicted >= 0.5) === point.actual).length /
    (calibrationPoints.length || 1);

  const calibrationReport = {
    program: options.program ?? 'unknown',
    sample_count: calibrationPoints.length,
    accuracy,
    ece,
    brier,
    agreement_summary: agreementSummaries,
    failure_modes: failureModes,
    correlated_errors: computeErrorCorrelation(modelOutcomes),
  };

  await fs.mkdir(options.outDir, { recursive: true });
  await fs.writeFile(
    path.join(options.outDir, 'calibration_report.json'),
    JSON.stringify(calibrationReport, null, 2),
    'utf8'
  );

  const csvLines = [
    'bin_start,bin_end,count,avg_predicted,accuracy',
    ...bins.map(
      (bin) =>
        `${bin.bin_start},${bin.bin_end},${bin.count},${bin.avg_predicted},${bin.accuracy}`
    ),
  ];
  await fs.writeFile(
    path.join(options.outDir, 'reliability_diagram.csv'),
    csvLines.join('\n'),
    'utf8'
  );

  await fs.writeFile(
    path.join(options.outDir, 'confusion_breakdown.json'),
    JSON.stringify(confusionByCategory, null, 2),
    'utf8'
  );

  await fs.writeFile(
    path.join(options.outDir, 'tasks.json'),
    JSON.stringify(tasks, null, 2),
    'utf8'
  );
}
