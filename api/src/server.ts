import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import rateLimit from 'express-rate-limit';
import * as dotenv from 'dotenv';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { verifyRoutes } from './routes/verify';
import { jobRoutes } from './routes/jobs';
import { statsRoutes } from './routes/stats';
import { programRoutes } from './routes/programs';
import { mmvRoutes } from './routes/mmv';
import { initializeBlockchain } from './services/blockchain';
import { initializeRedis } from './services/redis';
import { setupWebSocket } from './services/websocket';

dotenv.config({ path: '../.env' });

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// API Routes
app.use('/api/verify', verifyRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/mmv', mmvRoutes);

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
    logger.info('Initializing LLM Verifier API...');

    // Initialize Redis
    await initializeRedis();
    logger.info('✅ Redis connected');

    // Initialize blockchain connection
    await initializeBlockchain();
    logger.info('✅ Blockchain connected');

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
  logger.info(`🎉 LLM Verifier API running on http://${HOST}:${PORT}`);
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
