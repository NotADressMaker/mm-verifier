import http from 'node:http';
import { verifierMetrics } from '../observability/metrics';
import { logger } from '../utils/logger';

export function startMetricsServer(port: number): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': verifierMetrics.register.contentType });
      res.end(await verifierMetrics.register.metrics());
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(port, () => {
    logger.info('Metrics server listening', { port });
  });

  return server;
}
