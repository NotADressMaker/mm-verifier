import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';

interface Client {
  ws: WebSocket;
  subscriptions: Set<string>;
}

const clients = new Map<string, Client>();

/**
 * Setup WebSocket server
 */
export function setupWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket) => {
    const clientId = generateClientId();
    clients.set(clientId, { ws, subscriptions: new Set() });

    logger.info('WebSocket client connected', { clientId, totalClients: clients.size });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      message: 'Connected to LLM Verifier WebSocket',
    }));

    // Handle messages from client
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(clientId, message);
      } catch (error) {
        logger.error('Failed to parse WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
        }));
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      clients.delete(clientId);
      logger.info('WebSocket client disconnected', { clientId, totalClients: clients.size });
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket error:', { clientId, error });
    });
  });
}

/**
 * Handle client messages
 */
function handleClientMessage(clientId: string, message: any) {
  const client = clients.get(clientId);
  if (!client) return;

  switch (message.type) {
    case 'subscribe':
      // Subscribe to job updates
      if (message.jobId) {
        client.subscriptions.add(message.jobId);
        logger.info('Client subscribed to job', { clientId, jobId: message.jobId });
        client.ws.send(JSON.stringify({
          type: 'subscribed',
          jobId: message.jobId,
        }));
      }
      break;

    case 'unsubscribe':
      // Unsubscribe from job updates
      if (message.jobId) {
        client.subscriptions.delete(message.jobId);
        logger.info('Client unsubscribed from job', { clientId, jobId: message.jobId });
        client.ws.send(JSON.stringify({
          type: 'unsubscribed',
          jobId: message.jobId,
        }));
      }
      break;

    case 'ping':
      // Respond to ping
      client.ws.send(JSON.stringify({ type: 'pong' }));
      break;

    default:
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'Unknown message type',
      }));
  }
}

/**
 * Broadcast job update to subscribed clients
 */
export function broadcastJobUpdate(jobId: string, update: any) {
  let count = 0;

  for (const [clientId, client] of clients.entries()) {
    if (client.subscriptions.has(jobId) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'job_update',
        jobId,
        update,
        timestamp: new Date().toISOString(),
      }));
      count++;
    }
  }

  logger.info('Broadcasted job update', { jobId, clientCount: count });
}

/**
 * Broadcast to all connected clients
 */
export function broadcastToAll(message: any) {
  for (const [clientId, client] of clients.entries()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  logger.info('Broadcasted to all clients', { clientCount: clients.size });
}

/**
 * Generate unique client ID
 */
function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
