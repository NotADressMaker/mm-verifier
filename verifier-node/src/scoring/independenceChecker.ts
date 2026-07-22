export interface IndependenceSource {
  id: string;
  model_family?: string;
  provider_org?: string;
  retrieval_context_fingerprints?: string[];
}

export type IndependenceBasis = 'independent' | 'correlated' | 'unknown';

/** Conservative lineage check: missing declarations never become independent support. */
export function independenceBasis(source: IndependenceSource, compared: IndependenceSource[]): IndependenceBasis {
  if (!source.model_family && !source.provider_org && !source.retrieval_context_fingerprints?.length) return 'unknown';
  for (const other of compared) {
    if (source.id === other.id) continue;
    if ((source.model_family && source.model_family === other.model_family) ||
        (source.provider_org && source.provider_org === other.provider_org) ||
        source.retrieval_context_fingerprints?.some(hash => other.retrieval_context_fingerprints?.includes(hash))) return 'correlated';
  }
  return 'independent';
}

export function independentSupportCount(sources: IndependenceSource[]): number {
  const accepted: IndependenceSource[] = [];
  for (const source of sources) if (independenceBasis(source, accepted) === 'independent') accepted.push(source);
  return accepted.length;
}
