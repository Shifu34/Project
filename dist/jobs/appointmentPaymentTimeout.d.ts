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
export declare function startPaymentTimeoutJob(): void;
//# sourceMappingURL=appointmentPaymentTimeout.d.ts.map