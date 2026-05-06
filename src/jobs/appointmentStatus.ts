import { query } from '../config/database';
import { env } from '../config/env';
import logger from '../config/logger';

// How often to check (every 30 seconds)
const POLL_INTERVAL_MS = 30_000;

/**
 * Appointment Status Background Job
 *
 * On each tick:
 *  1. confirmed/scheduled appointments whose start time has arrived → in_progress
 *  2. in_progress appointments whose slot has fully passed → pending
 *  3. confirmed appointments whose slot has fully passed → no_show
 *     (still confirmed means nobody initiated the call)
 */
export function startAppointmentStatusJob(): void {
  logger.info('[AppointmentStatusJob] Started — poll interval: 30s');

  const run = async (): Promise<void> => {
    try {
      const tz = env.appTimezone;

      // ── 1. Transition to in_progress ────────────────────────────────
      // appointment_time is stored in local time; convert to UTC via AT TIME ZONE
      // before comparing to NOW() (which is always UTC in the DB).
      const startedResult = await query(
        `UPDATE appointments
         SET    status = 'in_progress'
         WHERE  status IN ('scheduled', 'confirmed')
           AND  (appointment_date + appointment_time) AT TIME ZONE $1 <= NOW()
         RETURNING id`,
        [tz],
      );

      if (startedResult.rows.length > 0) {
        const ids: number[] = startedResult.rows.map((r: { id: number }) => r.id);
        logger.info(
          `[AppointmentStatusJob] Marked in_progress: [${ids.join(', ')}]`,
        );
      }

      // ── 2. Transition to pending (appointment slot fully finished) ─────────
      const endedResult = await query(
        `UPDATE appointments
         SET    status = 'pending'
         WHERE  status = 'in_progress'
           AND  (appointment_date + appointment_time) AT TIME ZONE $1
                  + (duration_minutes || ' minutes')::INTERVAL <= NOW()
         RETURNING id`,
        [tz],
      );

      if (endedResult.rows.length > 0) {
        const ids: number[] = endedResult.rows.map((r: { id: number }) => r.id);
        logger.info(
          `[AppointmentStatusJob] Marked pending: [${ids.join(', ')}]`,
        );
      }

      // ── 3. Transition to no_show ─────────────────────────────────────────────
      // If the appointment slot has fully passed and the status is still 'confirmed'
      // it means nobody initiated the call, so it's a no_show.
      const noShowResult = await query(
        `UPDATE appointments
         SET    status = 'no_show'
         WHERE  status = 'confirmed'
           AND  (appointment_date + appointment_time) AT TIME ZONE $1
                  + (COALESCE(duration_minutes, 30) || ' minutes')::INTERVAL <= NOW()
         RETURNING id`,
        [tz],
      );

      if (noShowResult.rows.length > 0) {
        const ids: number[] = noShowResult.rows.map((r: { id: number }) => r.id);
        logger.info(
          `[AppointmentStatusJob] Marked no_show: [${ids.join(', ')}]`,
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
