import { query } from '../config/database';
import logger from '../config/logger';

// How often to check (every 30 seconds)
const POLL_INTERVAL_MS = 30_000;

/**
 * Appointment Status Background Job
 *
 * On each tick:
 *  1. confirmed/scheduled appointments whose start time has arrived
 *     → status set to 'in_progress'
 *  2. in_progress appointments whose start time + duration_minutes has passed
 *     → status set to 'pending'
 */
export function startAppointmentStatusJob(): void {
  logger.info('[AppointmentStatusJob] Started — poll interval: 30s');

  const run = async (): Promise<void> => {
    try {
      // ── 1. Transition to in_progress ────────────────────────────────
      const startedResult = await query(
        `UPDATE appointments
         SET    status = 'in_progress'
         WHERE  status IN ('scheduled', 'confirmed')
           AND  (appointment_date + appointment_time)::TIMESTAMP <= NOW()
         RETURNING id`,
        [],
      );

      if (startedResult.rows.length > 0) {
        const ids: number[] = startedResult.rows.map((r: { id: number }) => r.id);
        logger.info(
          `[AppointmentStatusJob] Marked in_progress: [${ids.join(', ')}]`,
        );
      }

      // ── 2. Transition to pending (appointment slot finished) ─────────
      const endedResult = await query(
        `UPDATE appointments
         SET    status = 'pending'
         WHERE  status = 'in_progress'
           AND  (appointment_date + appointment_time)::TIMESTAMP
                  + (duration_minutes || ' minutes')::INTERVAL <= NOW()
         RETURNING id`,
        [],
      );

      if (endedResult.rows.length > 0) {
        const ids: number[] = endedResult.rows.map((r: { id: number }) => r.id);
        logger.info(
          `[AppointmentStatusJob] Marked pending: [${ids.join(', ')}]`,
        );
      }
    } catch (err) {
      logger.error('[AppointmentStatusJob] Error during scheduled run', err);
    }
  };

  // Run once immediately, then on every interval
  run();
  setInterval(run, POLL_INTERVAL_MS);
}
