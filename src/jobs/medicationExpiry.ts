import { query } from '../config/database';
import logger from '../config/logger';

// Run once a day — expire prescriptions whose valid_until has passed
const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function startMedicationExpiryJob(): void {
  logger.info('[MedicationExpiryJob] Started — runs every 24 hours');

  const run = async (): Promise<void> => {
    try {
      const result = await query(
        `UPDATE prescriptions
         SET status = 'expired', updated_at = CURRENT_TIMESTAMP
         WHERE status = 'active'
           AND valid_until IS NOT NULL
           AND valid_until < CURRENT_DATE
         RETURNING id`,
      );

      if (result.rows.length > 0) {
        logger.info(`[MedicationExpiryJob] Expired ${result.rows.length} prescription(s)`);
      }
    } catch (err) {
      logger.error('[MedicationExpiryJob] Error expiring prescriptions', err);
    }
  };

  // Run immediately on startup, then every 24 hours
  run();
  setInterval(run, POLL_INTERVAL_MS);
}
