import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled Error', { 
    message: err.message, 
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body 
  });

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  // Stripe Errors
  if (err.type && err.type.startsWith('Stripe')) {
    return res.status(err.statusCode || 400).json({
      status: 'error',
      code: err.code,
      message: err.message,
    });
  }

  // Syntax Errors (JSON parse)
  if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({
          status: 'error',
          message: 'Invalid JSON payload'
      });
  }

  // Sequelize Errors
  if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
          status: 'error',
          message: 'Duplicate entry',
          errors: err.errors.map((e: any) => e.message)
      });
  }

  if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({
          status: 'error',
          message: 'Validation error',
          errors: err.errors.map((e: any) => e.message)
      });
  }

  // Default 500
  res.status(500).json({
    status: 'error',
    message: 'Internal Server Error',
  });
};
