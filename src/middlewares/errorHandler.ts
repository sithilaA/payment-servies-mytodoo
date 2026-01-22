import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
    let error = err;

    // Log the error
    logger.error(err.message, { stack: err.stack, path: req.path, method: req.method });

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            status: 'error',
            code: err.statusCode,
            message: err.message,
        });
    }

    // Handle specific known library errors
    if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
        const msg = (err as any).errors.map((e: any) => e.message).join(', ');
        return res.status(400).json({ status: 'error', code: 400, message: msg });
    }

    // Handle Database Connection Errors
    if (
        err.name === 'SequelizeConnectionError' ||
        err.name === 'SequelizeConnectionRefusedError' ||
        err.name === 'SequelizeHostNotFoundError' ||
        err.name === 'SequelizeHostNotReachableError' ||
        err.name === 'SequelizeInvalidConnectionError' ||
        err.name === 'SequelizeConnectionTimedOutError' ||
        (err as any).original?.code === 'ECONNREFUSED'
    ) {
        return res.status(503).json({
            status: 'error',
            code: 503,
            message: 'Service Unavailable: Database connection failed. Please try again later.'
        });
    }

    // Fallback for unhandled errors
    return res.status(500).json({
        status: 'error',
        code: 500,
        message: 'Internal Server Error',
    });
};
