export const config = {
  apiBaseUrl: process.env.MMV_API_BASE_URL || 'http://localhost:3000',
  validatorId: process.env.VALIDATOR_ID || 'validator-local',
  port: parseInt(process.env.VALIDATOR_PORT || '4010', 10),
  pollIntervalMs: parseInt(process.env.VALIDATOR_POLL_INTERVAL_MS || '4000', 10),
  dbPath: process.env.VALIDATOR_DB_PATH || './validator.db',
  receiptBaseUrl: process.env.VALIDATOR_RECEIPT_BASE_URL || 'http://localhost:4010',
  verifierKeyId: process.env.VALIDATOR_VERIFIER_KEY_ID || '',
};
