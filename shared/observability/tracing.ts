import { randomUUID } from 'node:crypto';

export interface TraceContext {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  request_id?: string;
}

export function createTraceContext(parent?: Partial<TraceContext>): TraceContext {
  return {
    trace_id: parent?.trace_id ?? randomUUID(),
    span_id: randomUUID(),
    parent_span_id: parent?.span_id,
    request_id: parent?.request_id,
  };
}

export function parseTraceHeaders(headers: Record<string, string | string[] | undefined>): TraceContext {
  const traceHeader = headers['x-trace-id'];
  const spanHeader = headers['x-span-id'];
  const requestHeader = headers['x-request-id'];
  const traceId = Array.isArray(traceHeader) ? traceHeader[0] : traceHeader;
  const spanId = Array.isArray(spanHeader) ? spanHeader[0] : spanHeader;
  const requestId = Array.isArray(requestHeader) ? requestHeader[0] : requestHeader;

  return createTraceContext({
    trace_id: traceId,
    span_id: spanId,
    request_id: requestId,
  });
}

export function serializeTraceHeaders(context: TraceContext): Record<string, string> {
  return {
    'x-trace-id': context.trace_id,
    'x-span-id': context.span_id,
    ...(context.request_id ? { 'x-request-id': context.request_id } : {}),
  };
}
