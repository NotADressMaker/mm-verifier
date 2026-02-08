import { resolveMockScenario } from '../../../shared/mockVerifier';

export function isMockVerifierEnabled(): boolean {
  return process.env.MOCK_VERIFIER === 'true';
}

export function isMockChainEnabled(): boolean {
  return process.env.MOCK_CHAIN === 'true';
}

export function getMockScenario() {
  return resolveMockScenario(process.env.MOCK_SCENARIO);
}

export function getMockVerifierDelayMs(): number {
  const value = Number.parseInt(process.env.MOCK_VERIFIER_DELAY_MS || '150', 10);
  return Number.isFinite(value) ? value : 150;
}
