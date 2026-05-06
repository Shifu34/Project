"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMedicationExpiryJob = startMedicationExpiryJob;
const database_1 = require("../config/database");
const logger_1 = __importDefault(require("../config/logger"));
// Run once a day — expire prescriptions whose valid_until has passed
const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
function startMedicationExpiryJob() {
    logger_1.default.info('[MedicationExpiryJob] Started — runs every 24 hours');
    const run = async () => {
        try {
            const result = await (0, database_1.query)(`UPDATE prescriptions
         SET status = 'expired', updated_at = CURRENT_TIMESTAMP
         WHERE status = 'active'
           AND valid_until IS NOT NULL
           AND valid_until < CURRENT_DATE
         RETURNING id`);
            if (result.rows.length > 0) {
                logger_1.default.info(`[MedicationExpiryJob] Expired ${result.rows.length} prescription(s)`);
            }
        }
        catch (err) {
            logger_1.default.error('[MedicationExpiryJob] Error expiring prescriptions', err);
        }
    };
    // Run immediately on startup, then every 24 hours
    run();
    setInterval(run, POLL_INTERVAL_MS);
}
//# sourceMappingURL=medicationExpiry.js.map