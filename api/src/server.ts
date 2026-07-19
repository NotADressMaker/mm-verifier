import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import rateLimit from 'express-rate-limit';
import * as dotenv from 'dotenv';
import path from 'path';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestContextMiddleware } from './middleware/requestContext';
import { verifyRoutes } from './routes/verify';
import { jobRoutes } from './routes/jobs';
import { jobBoardRoutes } from './routes/jobBoard';
import { statsRoutes } from './routes/stats';
import { programRoutes } from './routes/programs';
import { mamvRoutes } from './routes/mamv';
import { verifyV1Routes } from './routes/v1/verify';
import { programV1Routes } from './routes/v1/programs';
import { tasksV1Routes } from './routes/v1/tasks';
import { schemaV1Routes } from './routes/v1/schemas';
import { educationV1Routes } from './routes/v1/education';
import { validationRoutes } from './routes/validation';
import { initializeBlockchain } from './services/blockchain';
import { initializeJobBoardIndexer } from './services/jobBoardIndexer';
import { initializeRedis } from './services/redis';
import { setupWebSocket } from './services/websocket';
import { renderJobBoardDashboard } from './views/jobBoardDashboard';
import { isMockChainEnabled, isMockVerifierEnabled } from './utils/mockMode';
import { apiMetrics } from './observability/metrics';
import { organizationRoutes } from './routes/organizations';
import { receiptRoutes } from './routes/receipts';

dotenv.config({ path: path.resolve(__dirname, '../../.env.runtime') });
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: false });

const app: Application = express();
const PORT = process.env.API_PORT || 3000;
const HOST = process.env.API_HOST || 'localhost';

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: process.env.EDUCATION_MAX_PAYLOAD || '100kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestContextMiddleware);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Metrics
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', apiMetrics.register.contentType);
  res.status(200).send(await apiMetrics.register.metrics());
});

// API Routes
app.use('/api/verify', verifyRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/job-board', jobBoardRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/mamv', mamvRoutes);
// Deprecated compatibility alias for one release.
app.use('/api/mmv', mamvRoutes);
app.use('/api/validation', validationRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/v1/verify', verifyV1Routes);
app.use('/v1/education', limiter, educationV1Routes);
app.use('/v1/programs', programV1Routes);
app.use('/v1/tasks', tasksV1Routes);
app.use('/v1', schemaV1Routes);

app.get('/job-board', (_req, res) => {
  res.status(200).send(renderJobBoardDashboard());
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found',
  });
});

// Initialize services
async function initialize() {
  try {
    logger.info('Initializing MAMV API...');

    // Initialize Redis
    await initializeRedis();
    logger.info('✅ Redis connected');

    if (isMockVerifierEnabled() || isMockChainEnabled()) {
      logger.warn('MOCK mode enabled: skipping blockchain and job board initialization');
    } else {
      // Initialize blockchain connection
      await initializeBlockchain();
      logger.info('✅ Blockchain connected');

      // Initialize job board indexer
      await initializeJobBoardIndexer();
      logger.info('✅ Job board indexer initialized');
    }

    // Setup WebSocket handlers
    setupWebSocket(wss);
    logger.info('✅ WebSocket server initialized');

    logger.info('🚀 All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Start server
server.listen(PORT, async () => {
  await initialize();
  logger.info(`🎉 MAMV API running on http://${HOST}:${PORT}`);
  logger.info(`📡 WebSocket server running on ws://${HOST}:${PORT}/ws`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export { app, server, wss };
