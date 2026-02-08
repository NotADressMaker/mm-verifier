import { randomUUID } from 'node:crypto';

export type DebugTraceStageStatus = 'pending' | 'running' | 'ok' | 'error';

export type DebugTraceStage = {
  name: string;
  start_ms: number;
  end_ms?: number;
  duration_ms?: number;
  status: DebugTraceStageStatus;
  outputs?: Record<string, unknown>;
  error?: {
    message: string;
    code?: string;
  };
};

export type DebugTrace = {
  trace_id: string;
  task_id: string;
  stages: DebugTraceStage[];
};

const REDACT_KEYS = ['api_key', 'apikey', 'authorization', 'token', 'secret', 'password'];

function redact(value: unknown): unknown {
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map(redact);
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => {
        if (REDACT_KEYS.some((match) => key.toLowerCase().includes(match))) {
          return [key, '[redacted]'];
        }
        return [key, redact(val)];
      })
    );
  }
  return value;
}

export function createDebugTrace(taskId: string, traceId?: string): DebugTrace {
  return {
    trace_id: traceId ?? randomUUID(),
    task_id: taskId,
    stages: [],
  };
}

export function startStage(
  trace: DebugTrace,
  name: string,
  outputs?: Record<string, unknown>
): DebugTraceStage {
  const stage: DebugTraceStage = {
    name,
    start_ms: Date.now(),
    status: 'running',
    outputs: outputs ? (redact(outputs) as Record<string, unknown>) : undefined,
  };
  trace.stages.push(stage);
  return stage;
}

export function endStage(
  trace: DebugTrace,
  name: string,
  status: DebugTraceStageStatus,
  outputs?: Record<string, unknown>,
  error?: { message: string; code?: string }
): DebugTraceStage | undefined {
  const stage = [...trace.stages].reverse().find((s) => s.name === name && s.status === 'running');
  if (!stage) {
    return undefined;
  }
  stage.end_ms = Date.now();
  stage.duration_ms = stage.end_ms - stage.start_ms;
  stage.status = status;
  if (outputs) {
    stage.outputs = {
      ...(stage.outputs ?? {}),
      ...(redact(outputs) as Record<string, unknown>),
    };
  }
  if (error) {
    stage.error = error;
  }
  return stage;
}

export function getStage(trace: DebugTrace, name: string): DebugTraceStage | undefined {
  return trace.stages.find((stage) => stage.name === name);
}
