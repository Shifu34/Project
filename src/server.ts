import app from './app';
import { env } from './config/env';
import pool from './config/database';
import logger from './config/logger';
import { startPaymentTimeoutJob } from './jobs/appointmentPaymentTimeout';
import { startMedicationExpiryJob } from './jobs/medicationExpiry';
import { startAppointmentStatusJob } from './jobs/appointmentStatus';

const start = async () => {
  // Verify DB connection
  try {
    const client = await pool.connect();
    logger.info('PostgreSQL connected successfully');
    client.release();
  } catch (err) {
    logger.error('Failed to connect to PostgreSQL', err);
    process.exit(1);
  }

  // Start background jobs
  startPaymentTimeoutJob();
  startMedicationExpiryJob();
  startAppointmentStatusJob();

  const server = app.listen(env.port, () => {
    logger.info(`Murshid Hospital API running on port ${env.port} [${env.nodeEnv}]`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received – shutting down gracefully`);
    server.close(async () => {
      await pool.end();
      logger.info('Database pool closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
};

start();
