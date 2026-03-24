"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardStats = void 0;
const database_1 = require("../config/database");
// GET /dashboard/stats
const getDashboardStats = async (_req, res, next) => {
    try {
        const [patientStats, appointmentStats, encounterStats, paymentStats, recentAppointments, recentEncounters,] = await Promise.all([
            (0, database_1.query)(`SELECT
               COUNT(*) AS total,
               SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) AS active,
               SUM(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 ELSE 0 END) AS new_this_month
             FROM patients`),
            (0, database_1.query)(`SELECT
               COUNT(*) AS total_today,
               SUM(CASE WHEN status = 'scheduled'  THEN 1 ELSE 0 END) AS scheduled,
               SUM(CASE WHEN status = 'completed'  THEN 1 ELSE 0 END) AS completed,
               SUM(CASE WHEN status = 'cancelled'  THEN 1 ELSE 0 END) AS cancelled
             FROM appointments
             WHERE appointment_date = CURRENT_DATE`),
            (0, database_1.query)(`SELECT
               COUNT(*) AS total_active,
               SUM(CASE WHEN encounter_type = 'inpatient'   THEN 1 ELSE 0 END) AS inpatient,
               SUM(CASE WHEN encounter_type = 'outpatient'  THEN 1 ELSE 0 END) AS outpatient,
               SUM(CASE WHEN encounter_type = 'emergency'   THEN 1 ELSE 0 END) AS emergency
             FROM encounters
             WHERE status = 'in_progress'`),
            (0, database_1.query)(`SELECT
               COALESCE(SUM(amount), 0) AS total_collected,
               COUNT(*)                 AS total_payments
             FROM payments
             WHERE paid_at >= DATE_TRUNC('month', CURRENT_DATE)
               AND payment_status = 'completed'`),
            (0, database_1.query)(`SELECT a.*,
                    CONCAT(p.first_name,' ',p.last_name) AS patient_name,
                    CONCAT(u.first_name,' ',u.last_name) AS doctor_name
             FROM appointments a
             JOIN patients p ON p.id = a.patient_id
             JOIN doctors d ON d.id = a.doctor_id
             JOIN users u ON u.id = d.user_id
             WHERE a.appointment_date = CURRENT_DATE
             ORDER BY a.appointment_time ASC
             LIMIT 10`),
            (0, database_1.query)(`SELECT e.*,
                    CONCAT(p.first_name,' ',p.last_name) AS patient_name,
                    CONCAT(u.first_name,' ',u.last_name) AS doctor_name
             FROM encounters e
             JOIN patients p ON p.id = e.patient_id
             JOIN doctors d ON d.id = e.doctor_id
             JOIN users u ON u.id = d.user_id
             WHERE e.status = 'in_progress'
             ORDER BY e.encounter_date DESC
             LIMIT 10`),
        ]);
        res.json({
            success: true,
            data: {
                patients: patientStats.rows[0],
                todayAppointments: appointmentStats.rows[0],
                activeEncounters: encounterStats.rows[0],
                paymentsThisMonth: paymentStats.rows[0],
                recentAppointments: recentAppointments.rows,
                recentEncounters: recentEncounters.rows,
            },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getDashboardStats = getDashboardStats;
//# sourceMappingURL=dashboard.controller.js.map