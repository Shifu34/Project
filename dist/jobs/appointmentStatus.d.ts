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
export declare function startAppointmentStatusJob(): void;
//# sourceMappingURL=appointmentStatus.d.ts.map