import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger';
import { runWithLogContext } from '../../../shared/observability/logger';
import { createTraceContext, parseTraceHeaders } from '../../../shared/observability/tracing';

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const incomingTrace = parseTraceHeaders(req.headers as Record<string, string>);
  const requestId = incomingTrace.request_id ?? req.header('x-request-id') ?? randomUUID();
  const traceContext = createTraceContext({
    trace_id: incomingTrace.trace_id,
    span_id: incomingTrace.span_id,
    request_id: requestId,
  });

  res.setHeader('x-request-id', requestId);
  res.setHeader('x-trace-id', traceContext.trace_id);
  res.setHeader('x-span-id', traceContext.span_id);

  const start = Date.now();

  runWithLogContext(
    {
      request_id: requestId,
      trace_id: traceContext.trace_id,
      span_id: traceContext.span_id,
    },
    () => {
      logger.info('Request started', {
        method: req.method,
        path: req.path,
      });

      res.on('finish', () => {
        logger.info('Request completed', {
          method: req.method,
          path: req.path,
          status_code: res.statusCode,
          duration_ms: Date.now() - start,
        });
      });

      (req as Request & { traceContext?: typeof traceContext }).traceContext = traceContext;
      next();
    }
  );
}
