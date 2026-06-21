import { getChainIdFromEnv, getRpcUrl } from '../../shared/env';

describe('env helpers', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('prefers ARBITRUM_SEPOLIA_RPC_URL over ARBITRUM_RPC_URL', () => {
    process.env.ARBITRUM_RPC_URL = 'https://legacy.example';
    process.env.ARBITRUM_SEPOLIA_RPC_URL = 'https://sepolia.example';

    expect(getRpcUrl()).toBe('https://sepolia.example');
  });

  it('returns chain id from MAMV_CHAIN_ID or CHAIN_ID', () => {
    process.env.MAMV_CHAIN_ID = '421614';
    expect(getChainIdFromEnv()).toBe(421614);

    delete process.env.MAMV_CHAIN_ID;
    process.env.CHAIN_ID = '42161';
    expect(getChainIdFromEnv()).toBe(42161);
  });
});
