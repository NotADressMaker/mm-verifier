import { createHash } from 'crypto';

export interface AgreementMetrics {
  agreement_rate: number;
  pairwise_agreement: number;
  majority_margin: number;
  entropy: number;
  clusters: Array<{
    fingerprint: string;
    count: number;
    sample: string;
  }>;
}

export function fingerprintOutput(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex');
}

export function clusterOutputs(outputs: string[]): AgreementMetrics['clusters'] {
  const clusterMap = new Map<string, { count: number; sample: string }>();
  for (const output of outputs) {
    const fingerprint = fingerprintOutput(output);
    const entry = clusterMap.get(fingerprint);
    if (entry) {
      entry.count += 1;
    } else {
      clusterMap.set(fingerprint, { count: 1, sample: output });
    }
  }

  return Array.from(clusterMap.entries()).map(([fingerprint, value]) => ({
    fingerprint,
    count: value.count,
    sample: value.sample,
  }));
}

export function computeAgreementMetrics(outputs: string[]): AgreementMetrics {
  if (outputs.length === 0) {
    return {
      agreement_rate: 0,
      pairwise_agreement: 0,
      majority_margin: 0,
      entropy: 0,
      clusters: [],
    };
  }

  const clusters = clusterOutputs(outputs);
  const total = outputs.length;
  const sorted = [...clusters].sort((a, b) => b.count - a.count);
  const maxCount = sorted[0].count;
  const secondCount = sorted[1]?.count ?? 0;

  let matchingPairs = 0;
  for (const cluster of clusters) {
    matchingPairs += (cluster.count * (cluster.count - 1)) / 2;
  }
  const totalPairs = (total * (total - 1)) / 2;

  const entropy = clusters.reduce((sum, cluster) => {
    const p = cluster.count / total;
    return sum - (p > 0 ? p * Math.log2(p) : 0);
  }, 0);

  return {
    agreement_rate: maxCount / total,
    pairwise_agreement: totalPairs === 0 ? 1 : matchingPairs / totalPairs,
    majority_margin: (maxCount - secondCount) / total,
    entropy,
    clusters,
  };
}

export function computeErrorCorrelation(
  modelOutcomes: Record<string, boolean[]>
): Array<{ model_a: string; model_b: string; correlation: number }> {
  const models = Object.keys(modelOutcomes);
  const results: Array<{ model_a: string; model_b: string; correlation: number }> = [];

  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      const a = modelOutcomes[models[i]];
      const b = modelOutcomes[models[j]];
      const len = Math.min(a.length, b.length);

      let n11 = 0;
      let n00 = 0;
      let n10 = 0;
      let n01 = 0;

      for (let k = 0; k < len; k++) {
        if (a[k] && b[k]) n11++;
        else if (!a[k] && !b[k]) n00++;
        else if (a[k] && !b[k]) n10++;
        else n01++;
      }

      const numerator = n11 * n00 - n10 * n01;
      const denominator = Math.sqrt(
        (n11 + n10) * (n01 + n00) * (n11 + n01) * (n10 + n00)
      );
      const correlation = denominator === 0 ? 0 : numerator / denominator;

      results.push({
        model_a: models[i],
        model_b: models[j],
        correlation,
      });
    }
  }

  return results;
}
