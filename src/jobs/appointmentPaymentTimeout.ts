import { query } from '../config/database';
import { env } from '../config/env';
import logger from '../config/logger';

// How often to check for stale appointments (every 10 seconds)
const POLL_INTERVAL_MS = 10_000;

/**
 * Starts the payment-timeout background job.
 *
 * Logic:
 *   - Every POLL_INTERVAL_MS, scan for appointments where:
 *       status = 'scheduled'
 *       AND created_at is older than PAYMENT_TIMEOUT_MS ago
 *       AND there is no completed payment linked to them
 *   - Such appointments are hard-deleted (slot freed).
 *
 * Configuration (env):
 *   PAYMENT_TIMEOUT_MS  — milliseconds a patient has to pay (default: 1 800 000 = 30 min)
 *                         Set to 30000 (30 s) for local testing.
 */
export function startPaymentTimeoutJob(): void {
  const timeoutMs      = env.paymentTimeoutMs;
  const timeoutSeconds = timeoutMs / 1000;

  logger.info(
    `[PaymentTimeoutJob] Started — payment window: ${timeoutSeconds}s, poll interval: ${POLL_INTERVAL_MS / 1000}s`,
  );

  const run = async (): Promise<void> => {
    try {
      // Find scheduled appointments past the timeout with no completed payment
      const staleResult = await query(
        `SELECT a.id
         FROM   appointments a
         WHERE  a.status = 'scheduled'
           AND  a.created_at < NOW() - ($1 || ' seconds')::INTERVAL
           AND  NOT EXISTS (
                  SELECT 1
                  FROM   payments p
                  WHERE  p.appointment_id = a.id
                    AND  p.payment_status = 'completed'
                )`,
        [timeoutSeconds],
      );

      if (staleResult.rows.length === 0) return;

      const ids: number[] = staleResult.rows.map((r: { id: number }) => r.id);

      logger.warn(
        `[PaymentTimeoutJob] Deleting ${ids.length} unpaid appointment(s): [${ids.join(', ')}]`,
      );

      await query(
        `DELETE FROM appointments WHERE id = ANY($1::int[])`,
        [ids],
      );

      logger.info(`[PaymentTimeoutJob] Successfully deleted ${ids.length} appointment(s).`);
    } catch (err) {
      logger.error('[PaymentTimeoutJob] Error during scheduled run', err);
    }
  };

  // Run once immediately, then on every interval
  run();
  setInterval(run, POLL_INTERVAL_MS);
}
