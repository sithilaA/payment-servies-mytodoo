import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { requestIdStore } from '../middlewares/requestId';

// ─── Log Directory ──────────────────────────────────────────────────
const LOG_DIR = path.resolve(process.cwd(), 'logs');

// ─── Custom Log Levels (add 'http' between info and verbose) ────────
const levels: Record<string, number> = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// ─── Shared Format ──────────────────────────────────────────────────
const baseFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format((info) => {
    const requestId = requestIdStore.getStore();
    if (requestId) info.requestId = requestId;
    return info;
  })(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// ─── Console Format (colorized for dev) ─────────────────────────────
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format((info) => {
    const requestId = requestIdStore.getStore();
    if (requestId) info.requestId = requestId;
    return info;
  })(),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    const rid = requestId ? ` [${requestId}]` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}${rid}: ${message}${metaStr}`;
  })
);

// ─── Rotation Options (shared defaults) ─────────────────────────────
const rotateDefaults = {
  dirname: LOG_DIR,
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  zippedArchive: true,
};

// ─── Transport: Combined (all levels) ───────────────────────────────
const combinedTransport = new DailyRotateFile({
  ...rotateDefaults,
  filename: 'combined-%DATE%.log',
  level: 'debug',
});

// ─── Transport: Error only ──────────────────────────────────────────
const errorTransport = new DailyRotateFile({
  ...rotateDefaults,
  filename: 'error-%DATE%.log',
  level: 'error',
});

// ─── Transport: HTTP requests/responses only ────────────────────────
const httpTransport = new DailyRotateFile({
  ...rotateDefaults,
  filename: 'http-%DATE%.log',
  level: 'http',
  // Only write entries that are exactly level 'http'
  format: winston.format.combine(
    winston.format((info) => (info.level === 'http' ? info : false))(),
    baseFormat
  ),
});

// ─── Create Winston Logger ──────────────────────────────────────────
const winstonLogger = winston.createLogger({
  levels,
  level: process.env.LOG_LEVEL || 'debug',
  format: baseFormat,
  transports: [
    combinedTransport,
    errorTransport,
    httpTransport,
    new winston.transports.Console({ format: consoleFormat }),
  ],
  exitOnError: false,
});

// ─── Logger Wrapper (preserves existing API) ────────────────────────
class Logger {
  info(message: string, context: Record<string, any> = {}) {
    winstonLogger.info(message, context);
  }

  warn(message: string, context: Record<string, any> = {}) {
    winstonLogger.warn(message, context);
  }

  error(message: string, context: Record<string, any> = {}) {
    winstonLogger.error(message, context);
  }

  debug(message: string, context: Record<string, any> = {}) {
    winstonLogger.debug(message, context);
  }

  /** Dedicated HTTP-level log for request/response traffic */
  http(message: string, context: Record<string, any> = {}) {
    winstonLogger.log('http', message, context);
  }
}

export const logger = new Logger();
