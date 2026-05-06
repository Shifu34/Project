import { query } from '../config/database';
import { env } from '../config/env';
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
 *     AND a call room exists (someone initiated the call) → status set to 'pending'
 *  3. scheduled/confirmed/in_progress appointments whose full slot has passed
 *     AND no call room was ever created (nobody joined) → status set to 'no_show'
 *  4. scheduled/confirmed/in_progress appointments whose full slot has passed
 *     AND a room was created but neither doctor nor patient actually joined
 *     → status set to 'no_show'
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

      // ── 2. Transition to pending (appointment slot finished, call happened) ──
      // Only applies when a room was created AND at least one side joined
      const endedResult = await query(
        `UPDATE appointments
         SET    status = 'pending'
         WHERE  status = 'in_progress'
           AND  (appointment_date + appointment_time) AT TIME ZONE $1
                  + (duration_minutes || ' minutes')::INTERVAL <= NOW()
           AND  id IN (
                  SELECT appointment_id FROM video_call_rooms
                  WHERE  appointment_id IS NOT NULL
                    AND  (patient_joined_at IS NOT NULL OR doctor_joined_at IS NOT NULL)
                )
         RETURNING id`,
        [tz],
      );

      if (endedResult.rows.length > 0) {
        const ids: number[] = endedResult.rows.map((r: { id: number }) => r.id);
        logger.info(
          `[AppointmentStatusJob] Marked pending: [${ids.join(', ')}]`,
        );
      }

      // ── 3. Transition to no_show (slot passed, nobody joined) ────────
      // Covers two cases:
      //   a) No video_call_rooms row at all (nobody initiated the call)
      //   b) Room exists but neither side recorded a join timestamp
      const noShowResult = await query(
        `UPDATE appointments
         SET    status = 'no_show'
         WHERE  status IN ('scheduled', 'confirmed', 'in_progress')
           AND  (appointment_date + appointment_time) AT TIME ZONE $1
                  + (COALESCE(duration_minutes, 30) || ' minutes')::INTERVAL <= NOW()
           AND  (
                  id NOT IN (SELECT appointment_id FROM video_call_rooms WHERE appointment_id IS NOT NULL)
                  OR id IN (
                    SELECT appointment_id FROM video_call_rooms
                    WHERE  appointment_id IS NOT NULL
                      AND  patient_joined_at IS NULL
                      AND  doctor_joined_at IS NULL
                  )
                )
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
