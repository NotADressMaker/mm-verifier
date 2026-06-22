export const config = {
  mamvBaseUrl: process.env.MAMV_BASE_URL ?? 'http://localhost:3000',
  mamvApiKey: process.env.MAMV_API_KEY || undefined,
  chainId: Number(process.env.MAMV_CHAIN_ID ?? 42161),
  contractAddress: process.env.MAMV_CONTRACT_ADDRESS ?? '0x0000000000000000000000000000000000000000',
  guardBaseUrl: (process.env.MAMV_GUARD_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  rateLimitPerMinute: Number(process.env.MAMV_GUARD_RATE_LIMIT_PER_MINUTE ?? 60),
  webhookSecret: process.env.MAMV_GUARD_WEBHOOK_SECRET ?? 'change-me'
};
