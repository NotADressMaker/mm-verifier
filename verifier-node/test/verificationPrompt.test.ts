import { FACTUAL_WORLD_ANALYSIS_SYSTEM_PROMPT } from '../src/llm-providers/verificationPrompt';

describe('factual-world verification instructions', () => {
  it('requires verifiers to compare support with rival possible worlds', () => {
    expect(FACTUAL_WORLD_ANALYSIS_SYSTEM_PROMPT).toMatch(/Do not stop at asking whether a statement is supported/i);
    expect(FACTUAL_WORLD_ANALYSIS_SYSTEM_PROMPT).toMatch(/Which possible world/i);
    expect(FACTUAL_WORLD_ANALYSIS_SYSTEM_PROMPT).toMatch(/rival worlds/i);
    expect(FACTUAL_WORLD_ANALYSIS_SYSTEM_PROMPT).toMatch(/evidence distinguish/i);
  });
});
