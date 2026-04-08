import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env';
import router from './routes';
import { errorHandler, notFound } from './middleware/error.middleware';
import logger from './config/logger';

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: '*',
  credentials: false,
}));

// Request logging
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) },
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/v1', router);

// 404 handler (must come after routes)
app.use(notFound);

// Global error handler (must be last)
app.use(errorHandler);

export default app;
