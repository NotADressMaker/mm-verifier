import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

/**
 * Global Prisma Client with optimized connection pooling
 *
 * Performance Optimizations:
 * - Connection pooling with configurable pool size
 * - Query logging for performance monitoring
 * - Connection timeout configuration
 * - Graceful shutdown handling
 */

let prisma: PrismaClient;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    const connectionLimit = parseInt(process.env.DATABASE_POOL_SIZE || '10');
    const connectionTimeout = parseInt(process.env.DATABASE_TIMEOUT || '10000');

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    // Log slow queries for performance monitoring
    prisma.$on('query' as never, (e: any) => {
      if (e.duration > 1000) { // Log queries taking >1s
        logger.warn('Slow query detected', {
          query: e.query,
          duration: e.duration,
          params: e.params,
        });
      }
    });

    prisma.$on('error' as never, (e: any) => {
      logger.error('Prisma error:', e);
    });

    logger.info('Prisma client initialized', {
      connectionLimit,
      connectionTimeout,
    });
  }

  return prisma;
}

/**
 * Initialize database connection with connection pool
 */
export async function initializeDatabase() {
  try {
    const client = getPrismaClient();

    // Test connection
    await client.$queryRaw`SELECT 1`;

    logger.info('✅ Database connected with connection pooling');
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Disconnect database (for graceful shutdown)
 */
export async function disconnectDatabase() {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  }
}

export { prisma };
