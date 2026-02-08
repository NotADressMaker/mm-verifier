import winston, { Logger, transport } from 'winston';
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdirSync } from 'node:fs';

export type LogContext = Record<string, unknown>;

const logContext = new AsyncLocalStorage<LogContext>();

const REDACT_KEYS = ['api_key', 'apikey', 'authorization', 'token', 'secret', 'password'];

function redactValue(value: unknown): unknown {
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map(redactValue);
    }
    const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => {
      if (REDACT_KEYS.some((redactKey) => key.toLowerCase().includes(redactKey))) {
        return [key, '[redacted]'];
      }
      return [key, redactValue(val)];
    });
    return Object.fromEntries(entries);
  }
  return value;
}

const contextFormat = winston.format((info) => {
  const context = logContext.getStore();
  if (context) {
    Object.assign(info, context);
  }
  return info;
});

const redactFormat = winston.format((info) => {
  const { message, ...rest } = info;
  const redacted = redactValue(rest);
  const redactedMeta =
    redacted && typeof redacted === 'object' ? (redacted as Record<string, unknown>) : {};
  Object.assign(info, redactedMeta);
  info.message = message;
  return info;
});

function ensureLogsDir() {
  const logsDir = 'logs';
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
}

export function createLogger(options: {
  service: string;
  level?: string;
  transports?: transport[];
}): Logger {
  ensureLogsDir();

  const logLevel = options.level ?? process.env.LOG_LEVEL ?? 'info';
  const transports = options.transports ?? [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: `logs/${options.service}.log`,
      maxsize: 10485760,
      maxFiles: 10,
    }),
  ];

  return winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      contextFormat(),
      redactFormat(),
      winston.format.json()
    ),
    defaultMeta: { service: options.service },
    transports,
  });
}

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return logContext.run(context, fn);
}

export function withContext(logger: Logger, context: LogContext): Logger {
  return logger.child(context);
}

export function getLogContext(): LogContext {
  return logContext.getStore() ?? {};
}
