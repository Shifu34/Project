import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

export interface AppError extends Error {
  status?: number;
  code?: string;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  logger.error(err.message, { stack: err.stack, code: err.code });

  // PostgreSQL unique violation
  if (err.code === '23505') {
    res.status(409).json({ success: false, message: 'Duplicate entry – record already exists' });
    return;
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    res.status(400).json({ success: false, message: 'Referenced record does not exist' });
    return;
  }

  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: status === 500 ? `Internal server error: ${err.message}` : err.message,
  });
};

export const notFound = (_req: Request, res: Response): void => {
  res.status(404).json({ success: false, message: 'Route not found' });
};
