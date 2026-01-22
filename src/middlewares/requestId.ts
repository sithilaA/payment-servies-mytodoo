import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

export const requestIdStore = new AsyncLocalStorage<string>();

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.headers['x-request-id'] = requestId; // Attach to req for visibility
  res.setHeader('x-request-id', requestId); // Return to client

  requestIdStore.run(requestId, () => {
    next();
  });
};
