import * as dotenv from 'dotenv';
import { logger } from './utils/logger';
import { initializeBlockchain } from './services/blockchain';
import { startJobProcessor } from './services/jobProcessor';
import { registerAsVerifier } from './services/staking';

dotenv.config({ path: '../.env' });

async function main() {
  try {
    logger.info('🚀 Starting LLM Verifier Node...');

    // Initialize blockchain connection
    await initializeBlockchain();
    logger.info('✅ Blockchain connected');

    // Register as verifier if not already registered
    const shouldRegister = process.env.AUTO_REGISTER_VERIFIER === 'true';
    if (shouldRegister) {
      await registerAsVerifier();
      logger.info('✅ Registered as verifier');
    }

    // Start job processor
    await startJobProcessor();
    logger.info('✅ Job processor started');

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
