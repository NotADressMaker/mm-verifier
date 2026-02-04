import { VerifierPlugin } from './types';
import { deterministicPlugin } from './deterministic';
import { testSuitePlugin } from './testSuite';
import { teeOrZkPlugin } from './teeOrZk';
import { MmvValidationRequest, MmvResult } from '../../../../shared/validationTypes';

const plugins: VerifierPlugin[] = [deterministicPlugin, testSuitePlugin, teeOrZkPlugin];

export function resolvePlugin(request: MmvValidationRequest): VerifierPlugin | null {
  return plugins.find((plugin) => plugin.canHandle(request)) ?? null;
}

export async function runVerification(request: MmvValidationRequest): Promise<MmvResult> {
  const plugin = resolvePlugin(request);
  if (!plugin) {
    throw new Error(`No plugin found for ${request.plugin}`);
  }
  return plugin.verify(request);
}
