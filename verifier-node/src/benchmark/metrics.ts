export interface CalibrationPoint {
  predicted: number;
  actual: boolean;
}

export interface CalibrationBin {
  bin_start: number;
  bin_end: number;
  count: number;
  avg_predicted: number;
  accuracy: number;
}

export function computeCalibrationBins(
  points: CalibrationPoint[],
  bins: number = 10
): CalibrationBin[] {
  const binSize = 1 / bins;
  const buckets: CalibrationBin[] = Array.from({ length: bins }, (_, index) => ({
    bin_start: index * binSize,
    bin_end: (index + 1) * binSize,
    count: 0,
    avg_predicted: 0,
    accuracy: 0,
  }));

  for (const point of points) {
    const clamped = Math.max(0, Math.min(1, point.predicted));
    const index = Math.min(Math.floor(clamped / binSize), bins - 1);
    const bucket = buckets[index];
    bucket.count += 1;
    bucket.avg_predicted += clamped;
    bucket.accuracy += point.actual ? 1 : 0;
  }

  for (const bucket of buckets) {
    if (bucket.count > 0) {
      bucket.avg_predicted /= bucket.count;
      bucket.accuracy /= bucket.count;
    }
  }

  return buckets.filter((bucket) => bucket.count > 0);
}

export function computeExpectedCalibrationError(bins: CalibrationBin[]): number {
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  if (total === 0) return 0;

  return (
    bins.reduce(
      (sum, bin) => sum + Math.abs(bin.avg_predicted - bin.accuracy) * bin.count,
      0
    ) / total
  );
}

export function computeBrierScore(points: CalibrationPoint[]): number {
  if (points.length === 0) return 0;

  const sum = points.reduce((acc, point) => {
    const target = point.actual ? 1 : 0;
    return acc + Math.pow(point.predicted - target, 2);
  }, 0);

  return sum / points.length;
}
