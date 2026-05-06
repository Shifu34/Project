/**
 * Appointment Status Background Job
 *
 * On each tick:
 *  1. confirmed/scheduled appointments whose start time has arrived
 *     → status set to 'in_progress'
 *  2. in_progress appointments whose start time + duration_minutes has passed
 *     → status set to 'pending'
 */
export declare function startAppointmentStatusJob(): void;
//# sourceMappingURL=appointmentStatus.d.ts.map