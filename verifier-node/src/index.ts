import * as dotenv from 'dotenv';
import path from 'path';
import { logger } from './utils/logger';
import { initializeBlockchain } from './services/blockchain';
import { startJobProcessor } from './services/jobProcessor';
import { registerAsVerifier } from './services/staking';
import { startMockJobProcessor } from './services/mockJobProcessor';
import { startMetricsServer } from './services/metricsServer';
import { purgeEncryptedEvidence } from './evidence/evidenceStorage';

dotenv.config({ path: path.resolve(__dirname, '../../.env.runtime') });
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: false });

async function main() {
  try {
    logger.info('🚀 Starting LLM Verifier Node...');

    const mockMode = process.env.MOCK_VERIFIER === 'true';
    if (mockMode) {
      logger.warn('MOCK_VERIFIER enabled: skipping blockchain setup');
    } else {
      // Initialize blockchain connection
      await initializeBlockchain();
      logger.info('✅ Blockchain connected');
    }

    // Register as verifier if not already registered
    const shouldRegister = process.env.AUTO_REGISTER_VERIFIER === 'true';
    if (!mockMode && shouldRegister) {
      await registerAsVerifier();
      logger.info('✅ Registered as verifier');
    }

    // Start job processor
    if (mockMode) {
      await startMockJobProcessor();
      logger.info('✅ Mock job processor started');
    } else {
      await startJobProcessor();
      logger.info('✅ Job processor started');
    }

    const metricsPort = parseInt(process.env.METRICS_PORT || '9101', 10);
    startMetricsServer(metricsPort);

    const retentionDays = Number.parseInt(process.env.RETENTION_DAYS || '7', 10);
    if (Number.isFinite(retentionDays) && retentionDays > 0) {
      const intervalMs = 12 * 60 * 60 * 1000;
      setInterval(() => {
        const result = purgeEncryptedEvidence({
          older_than_ms: retentionDays * 24 * 60 * 60 * 1000,
        });
        if (result.removed > 0) {
          logger.info('Purged encrypted evidence', result);
        }
      }, intervalMs);
      logger.info('Evidence retention enabled', { retentionDays });
    }

    logger.info('🎉 Verifier node is running!');
    logger.info('Verifier address:', process.env.VERIFIER_PRIVATE_KEY ? 'configured' : 'NOT configured');
    logger.info('Node ID:', process.env.VERIFIER_NODE_ID || 'default');
  } catch (error) {
    logger.error('Failed to start verifier node:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

main();
