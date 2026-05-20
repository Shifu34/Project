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

  // PostgreSQL numeric value out of range (e.g. temperature field overflow)
  if (err.code === '22003') {
    res.status(400).json({
      success: false,
      message: 'One or more values are out of the accepted range. Please check vitals (e.g. temperature, blood pressure) and re-enter.',
    });
    return;
  }

  // PostgreSQL not-null constraint violation
  if (err.code === '23502') {
    res.status(400).json({ success: false, message: 'A required field is missing. Please fill in all required information.' });
    return;
  }

  // PostgreSQL invalid input syntax (e.g. wrong type for a field)
  if (err.code === '22P02') {
    res.status(400).json({ success: false, message: 'Invalid value provided for one or more fields. Please check your input.' });
    return;
  }

  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
  });
};

export const notFound = (_req: Request, res: Response): void => {
  res.status(404).json({ success: false, message: 'Route not found' });
};
