import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Sanitize request body to avoid logging sensitive fields.
 * Add field names to the set below to redact them from logs.
 */
const SENSITIVE_FIELDS = new Set([
  'password', 'token', 'secret', 'authorization',
  'credit_card', 'card_number', 'cvv', 'ssn',
]);

function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  // Log incoming request with comprehensive details
  logger.http(`→ ${req.method} ${req.originalUrl}`, {
    event: 'request_start',
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    contentType: req.get('content-type'),
    contentLength: req.get('content-length'),
    referer: req.get('referer'),
    host: req.get('host'),
    body: sanitizeBody(req.body),
  });

  // Capture response body size
  const originalEnd = res.end;
  let responseSize = 0;

  res.end = function (this: Response, ...args: any[]) {
    const chunk = args[0];
    if (chunk) {
      responseSize += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
    }
    return originalEnd.apply(this, args as any);
  } as any;

  // Hook into response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    // Determine log level based on status code
    const logData = {
      event: 'request_complete',
      method: req.method,
      url: req.originalUrl,
      path: req.path,
      status: statusCode,
      duration: `${duration}ms`,
      durationMs: duration,
      responseSize,
      contentType: res.get('content-type'),
    };

    if (statusCode >= 500) {
      logger.error(`✗ ${req.method} ${req.originalUrl} ${statusCode} (${duration}ms)`, logData);
    } else if (statusCode >= 400) {
      logger.warn(`⚠ ${req.method} ${req.originalUrl} ${statusCode} (${duration}ms)`, logData);
    } else {
      logger.http(`✓ ${req.method} ${req.originalUrl} ${statusCode} (${duration}ms)`, logData);
    }
  });

  next();
};
