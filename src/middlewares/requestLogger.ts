import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  // Log request start
  logger.info(`Incoming ${req.method} ${req.url}`, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: req.body // Be careful with PII/Sensitivty in prod, maybe sanitize later
  });

  // Hook into response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`Completed ${req.method} ${req.url}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      method: req.method,
      url: req.url
    });
  });

  next();
};
