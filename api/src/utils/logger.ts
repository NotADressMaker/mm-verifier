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
  defaultMeta: { service: 'llm-verifier-api' },
  transports: [
    // Write all logs to console
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

    // Write errors to file
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),

    // Write all logs to file
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
  ],
});

// Create logs directory if it doesn't exist
import { existsSync, mkdirSync } from 'fs';
const logsDir = 'logs';
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}
