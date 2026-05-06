"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPaymentTimeoutJob = startPaymentTimeoutJob;
const database_1 = require("../config/database");
const env_1 = require("../config/env");
const logger_1 = __importDefault(require("../config/logger"));
// How often to check for stale appointments (every 10 seconds)
const POLL_INTERVAL_MS = 10000;
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
function startPaymentTimeoutJob() {
    const timeoutMs = env_1.env.paymentTimeoutMs;
    const timeoutSeconds = timeoutMs / 1000;
    logger_1.default.info(`[PaymentTimeoutJob] Started — payment window: ${timeoutSeconds}s, poll interval: ${POLL_INTERVAL_MS / 1000}s`);
    const run = async () => {
        try {
            // Find scheduled appointments past the timeout with no completed payment
            const staleResult = await (0, database_1.query)(`SELECT a.id
         FROM   appointments a
         WHERE  a.status = 'scheduled'
           AND  a.created_at < NOW() - ($1 || ' seconds')::INTERVAL
           AND  NOT EXISTS (
                  SELECT 1
                  FROM   payments p
                  WHERE  p.appointment_id = a.id
                    AND  p.payment_status = 'completed'
                )`, [timeoutSeconds]);
            if (staleResult.rows.length === 0)
                return;
            const ids = staleResult.rows.map((r) => r.id);
            logger_1.default.warn(`[PaymentTimeoutJob] Deleting ${ids.length} unpaid appointment(s): [${ids.join(', ')}]`);
            await (0, database_1.query)(`DELETE FROM appointments WHERE id = ANY($1::int[])`, [ids]);
            logger_1.default.info(`[PaymentTimeoutJob] Successfully deleted ${ids.length} appointment(s).`);
        }
        catch (err) {
            logger_1.default.error('[PaymentTimeoutJob] Error during scheduled run', err);
        }
    };
    // Run once immediately, then on every interval
    run();
    setInterval(run, POLL_INTERVAL_MS);
}
//# sourceMappingURL=appointmentPaymentTimeout.js.map