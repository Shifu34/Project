"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAppointmentStatusJob = startAppointmentStatusJob;
const database_1 = require("../config/database");
const env_1 = require("../config/env");
const logger_1 = __importDefault(require("../config/logger"));
// How often to check (every 30 seconds)
const POLL_INTERVAL_MS = 30000;
/**
 * Appointment Status Background Job
 *
 * On each tick:
 *  1. confirmed appointments whose full slot has passed → no_show
 *     (still confirmed = nobody initiated the call)
 *  2. confirmed/scheduled appointments whose start time has arrived
 *     but slot hasn't ended yet → in_progress
 *  3. in_progress appointments whose slot has fully passed → pending
 */
function startAppointmentStatusJob() {
    logger_1.default.info('[AppointmentStatusJob] Started — poll interval: 30s');
    const run = async () => {
        try {
            const tz = env_1.env.appTimezone;
            // ── 1. Transition to no_show (runs first so step 2 won't grab these) ──
            // Confirmed appointments whose full slot has passed = nobody joined the call.
            const noShowResult = await (0, database_1.query)(`UPDATE appointments
         SET    status = 'no_show'
         WHERE  status = 'confirmed'
           AND  (appointment_date + appointment_time) AT TIME ZONE $1
                  + (COALESCE(duration_minutes, 30) || ' minutes')::INTERVAL <= NOW()
         RETURNING id`, [tz]);
            if (noShowResult.rows.length > 0) {
                const ids = noShowResult.rows.map((r) => r.id);
                logger_1.default.info(`[AppointmentStatusJob] Marked no_show: [${ids.join(', ')}]`);
            }
            // ── 2. Transition to in_progress ────────────────────────────────────────
            // Only appointments whose slot has STARTED but not yet ENDED.
            // (fully-ended confirmed ones were already handled above as no_show)
            const startedResult = await (0, database_1.query)(`UPDATE appointments
         SET    status = 'in_progress'
         WHERE  status IN ('scheduled', 'confirmed')
           AND  (appointment_date + appointment_time) AT TIME ZONE $1 <= NOW()
           AND  (appointment_date + appointment_time) AT TIME ZONE $1
                  + (COALESCE(duration_minutes, 30) || ' minutes')::INTERVAL > NOW()
         RETURNING id`, [tz]);
            if (startedResult.rows.length > 0) {
                const ids = startedResult.rows.map((r) => r.id);
                logger_1.default.info(`[AppointmentStatusJob] Marked in_progress: [${ids.join(', ')}]`);
            }
            // ── 3. Transition to pending (appointment slot fully finished) ───────────
            const endedResult = await (0, database_1.query)(`UPDATE appointments
         SET    status = 'pending'
         WHERE  status = 'in_progress'
           AND  (appointment_date + appointment_time) AT TIME ZONE $1
                  + (duration_minutes || ' minutes')::INTERVAL <= NOW()
         RETURNING id`, [tz]);
            if (endedResult.rows.length > 0) {
                const ids = endedResult.rows.map((r) => r.id);
                logger_1.default.info(`[AppointmentStatusJob] Marked pending: [${ids.join(', ')}]`);
            }
        }
        catch (err) {
            logger_1.default.error('[AppointmentStatusJob] Error during scheduled run', err);
        }
    };
    // Run once immediately, then on every interval
    run();
    setInterval(run, POLL_INTERVAL_MS);
}
//# sourceMappingURL=appointmentStatus.js.map