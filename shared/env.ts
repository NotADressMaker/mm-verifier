export function getRpcUrl(): string {
  return (
    process.env.ARBITRUM_SEPOLIA_RPC_URL ||
    process.env.ARBITRUM_RPC_URL ||
    'https://sepolia-rollup.arbitrum.io/rpc'
  );
}

export function getChainIdFromEnv(): number | undefined {
  const value = process.env.MMV_CHAIN_ID || process.env.CHAIN_ID;
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
