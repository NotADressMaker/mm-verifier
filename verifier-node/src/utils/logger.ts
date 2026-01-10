import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'llm-verifier-node' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let log = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(meta).length > 0 && meta.service) {
            const { service, ...rest } = meta;
            if (Object.keys(rest).length > 0) {
              log += ` ${JSON.stringify(rest)}`;
            }
          }
          return log;
        })
      ),
    }),

    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760,
      maxFiles: 5,
    }),

    new winston.transports.File({
      filename: 'logs/verifier.log',
      maxsize: 10485760,
      maxFiles: 10,
    }),
  ],
});

// Create logs directory
import { existsSync, mkdirSync } from 'fs';
const logsDir = 'logs';
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}
