"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAppointmentCategories = exports.cancelAppointment = exports.patchAppointment = exports.getUpcomingAppointment = exports.getMyAppointments = exports.updateAppointment = exports.updateAppointmentStatus = exports.createAppointment = exports.getAppointmentById = exports.getAppointments = void 0;
const database_1 = require("../config/database");
// GET /appointments
const getAppointments = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.params.page || '1', 10));
        const size = Math.min(100, parseInt(req.params.size || '20', 10));
        const date = req.query.date;
        const status = req.query.status;
        const offset = (page - 1) * size;
        const conditions = [];
        const params = [size, offset];
        let idx = 3;
        if (date) {
            conditions.push(`a.appointment_date = $${idx++}`);
            params.push(date);
        }
        if (status) {
            conditions.push(`a.status = $${idx++}`);
            params.push(status);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT a.*,
                CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code,
                CONCAT(u.first_name,' ',u.last_name) AS doctor_name,
                dept.name AS department
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         JOIN doctors doc ON doc.id = a.doctor_id
         JOIN users u ON u.id = doc.user_id
         LEFT JOIN departments dept ON dept.id = a.department_id
         ${where}
         ORDER BY a.appointment_date DESC, a.appointment_time DESC
         LIMIT $1 OFFSET $2`, params),
            (0, database_1.query)(`SELECT COUNT(*) FROM appointments a ${where}`, conditions.length ? params.slice(2) : []),
        ]);
        const total = parseInt(countRes.rows[0].count, 10);
        res.json({ success: true, data: dataRes.rows, pagination: { total, page, size, totalPages: Math.ceil(total / size) } });
    }
    catch (err) {
        next(err);
    }
};
exports.getAppointments = getAppointments;
// GET /appointments/:id
const getAppointmentById = async (req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT a.*,
              CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code, p.phone AS patient_phone,
              CONCAT(u.first_name,' ',u.last_name) AS doctor_name, doc.specialization,
              dept.name AS department
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN doctors doc ON doc.id = a.doctor_id
       JOIN users u ON u.id = doc.user_id
       LEFT JOIN departments dept ON dept.id = a.department_id
       WHERE a.id = $1`, [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Appointment not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.getAppointmentById = getAppointmentById;
// POST /appointments
const createAppointment = async (req, res, next) => {
    try {
        const { patient_id, doctor_id, department_id, appointment_date, appointment_time, duration_minutes, appointment_type, nature_of_visit, reason, notes, } = req.body;
        const bookedBy = req.user?.userId;
        // Conflict check
        const conflict = await (0, database_1.query)(`SELECT id FROM appointments
       WHERE doctor_id = $1 AND appointment_date = $2 AND appointment_time = $3
         AND status NOT IN ('cancelled','no_show')`, [doctor_id, appointment_date, appointment_time]);
        if (conflict.rows.length > 0) {
            res.status(409).json({ success: false, message: 'Doctor already has an appointment at this time' });
            return;
        }
        const result = await (0, database_1.query)(`INSERT INTO appointments
         (patient_id, doctor_id, department_id, appointment_date, appointment_time,
          duration_minutes, appointment_type, nature_of_visit, reason, notes, booked_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [patient_id, doctor_id, department_id, appointment_date, appointment_time,
            duration_minutes || 30, appointment_type || 'Online Consultation', nature_of_visit, reason, notes, bookedBy]);
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.createAppointment = createAppointment;
// PATCH /appointments/:id/status
const updateAppointmentStatus = async (req, res, next) => {
    try {
        const { status, cancellation_reason } = req.body;
        const cancelledBy = req.user?.userId;
        const result = await (0, database_1.query)(`UPDATE appointments
       SET status = $1,
           cancelled_by = CASE WHEN $1 = 'cancelled' THEN $3::INT ELSE cancelled_by END,
           cancellation_reason = CASE WHEN $1 = 'cancelled' THEN $2 ELSE cancellation_reason END
       WHERE id = $4 RETURNING *`, [status, cancellation_reason, cancelledBy, req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Appointment not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.updateAppointmentStatus = updateAppointmentStatus;
// PUT /appointments/:id
const updateAppointment = async (req, res, next) => {
    try {
        const { appointment_date, appointment_time, duration_minutes, appointment_type, nature_of_visit, reason, notes, } = req.body;
        const result = await (0, database_1.query)(`UPDATE appointments
       SET appointment_date=$1, appointment_time=$2, duration_minutes=$3,
           appointment_type=$4, nature_of_visit=$5, reason=$6, notes=$7
       WHERE id = $8 RETURNING *`, [appointment_date, appointment_time, duration_minutes, appointment_type, nature_of_visit, reason, notes, req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Appointment not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.updateAppointment = updateAppointment;
// GET /appointments/me  — works for both patient and doctor
const getMyAppointments = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const roleName = req.user.roleName;
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const size = Math.min(100, parseInt(req.query.limit || '20', 10));
        const status = req.query.status;
        const date = req.query.date;
        const offset = (page - 1) * size;
        let ownerCondition;
        let ownerParam;
        if (roleName === 'patient') {
            const patientRes = await (0, database_1.query)(`SELECT id FROM patients WHERE user_id = $1 LIMIT 1`, [userId]);
            if (patientRes.rows.length === 0) {
                res.status(404).json({ success: false, message: 'Patient profile not found' });
                return;
            }
            ownerCondition = 'a.patient_id = $3';
            ownerParam = patientRes.rows[0].id;
        }
        else if (roleName === 'doctor') {
            const doctorRes = await (0, database_1.query)(`SELECT id FROM doctors WHERE user_id = $1 LIMIT 1`, [userId]);
            if (doctorRes.rows.length === 0) {
                res.status(404).json({ success: false, message: 'Doctor profile not found' });
                return;
            }
            ownerCondition = 'a.doctor_id = $3';
            ownerParam = doctorRes.rows[0].id;
        }
        else {
            res.status(403).json({ success: false, message: 'Only patients and doctors can use this endpoint' });
            return;
        }
        const dataParams = [size, offset, ownerParam];
        const countParams = [ownerParam];
        const ownerColClause = ownerCondition; // e.g. 'a.patient_id = $3'
        const ownerColClauseCount = ownerCondition.replace('$3', '$1');
        const dataConditions = [ownerColClause];
        const countConditions = [ownerColClauseCount];
        let dataIdx = 4;
        let countIdx = 2;
        if (status) {
            dataConditions.push(`a.status = $${dataIdx++}`);
            countConditions.push(`a.status = $${countIdx++}`);
            dataParams.push(status);
            countParams.push(status);
        }
        if (date) {
            dataConditions.push(`a.appointment_date = $${dataIdx++}`);
            countConditions.push(`a.appointment_date = $${countIdx++}`);
            dataParams.push(date);
            countParams.push(date);
        }
        const where = `WHERE ${dataConditions.join(' AND ')}`;
        const countWhere = `WHERE ${countConditions.join(' AND ')}`;
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT
           a.id, a.appointment_date, a.appointment_time, a.duration_minutes,
           a.appointment_type, a.nature_of_visit, a.status, a.reason, a.notes,
           a.cancellation_reason, a.created_at,
           CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code, p.phone AS patient_phone,
           doc.id AS doctor_id,
           CONCAT(doc.first_name,' ',doc.last_name) AS doctor_name,
           doc.specialization, doc.consultation_fee,
           dept.name AS department
         FROM appointments a
         JOIN patients p   ON p.id   = a.patient_id
         JOIN doctors doc  ON doc.id = a.doctor_id
         LEFT JOIN departments dept ON dept.id = a.department_id
         ${where}
         ORDER BY a.appointment_date DESC, a.appointment_time DESC
         LIMIT $1 OFFSET $2`, dataParams),
            (0, database_1.query)(`SELECT COUNT(*) FROM appointments a ${countWhere}`, countParams),
        ]);
        const total = parseInt(countRes.rows[0].count, 10);
        res.json({
            success: true,
            data: dataRes.rows,
            pagination: { total, page, size, totalPages: Math.ceil(total / size) },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getMyAppointments = getMyAppointments;
// GET /appointments/upcoming?days=7  — next 1 upcoming appointment
const getUpcomingAppointment = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const roleName = req.user.roleName;
        const days = Math.max(1, Math.min(365, parseInt(req.query.days || '7', 10)));
        let ownerCondition;
        let ownerParam;
        if (roleName === 'patient') {
            const patientRes = await (0, database_1.query)(`SELECT id FROM patients WHERE user_id = $1 LIMIT 1`, [userId]);
            if (patientRes.rows.length === 0) {
                res.status(404).json({ success: false, message: 'Patient profile not found' });
                return;
            }
            ownerCondition = 'a.patient_id = $1';
            ownerParam = patientRes.rows[0].id;
        }
        else if (roleName === 'doctor') {
            const doctorRes = await (0, database_1.query)(`SELECT id FROM doctors WHERE user_id = $1 LIMIT 1`, [userId]);
            if (doctorRes.rows.length === 0) {
                res.status(404).json({ success: false, message: 'Doctor profile not found' });
                return;
            }
            ownerCondition = 'a.doctor_id = $1';
            ownerParam = doctorRes.rows[0].id;
        }
        else {
            res.status(403).json({ success: false, message: 'Only patients and doctors can use this endpoint' });
            return;
        }
        const result = await (0, database_1.query)(`SELECT
         a.id, a.appointment_date, a.appointment_time, a.duration_minutes,
         a.appointment_type, a.nature_of_visit, a.status, a.reason, a.notes,
         a.created_at,
         CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code,
         doc.id AS doctor_id,
         CONCAT(doc.first_name,' ',doc.last_name) AS doctor_name,
         doc.specialization, doc.consultation_fee,
         dept.name AS department
       FROM appointments a
       JOIN patients p   ON p.id   = a.patient_id
       JOIN doctors doc  ON doc.id = a.doctor_id
       LEFT JOIN departments dept ON dept.id = a.department_id
       WHERE ${ownerCondition}
         AND a.appointment_date >= CURRENT_DATE
         AND a.appointment_date <= CURRENT_DATE + ($2 || ' days')::INTERVAL
         AND a.status NOT IN ('cancelled', 'no_show')
       ORDER BY a.appointment_date ASC, a.appointment_time ASC
       LIMIT 1`, [ownerParam, days]);
        res.json({ success: true, data: result.rows[0] || null });
    }
    catch (err) {
        next(err);
    }
};
exports.getUpcomingAppointment = getUpcomingAppointment;
// PATCH /appointments/:id  — partial update (any subset of fields)
const patchAppointment = async (req, res, next) => {
    try {
        const allowed = [
            'appointment_date', 'appointment_time', 'duration_minutes',
            'appointment_type', 'nature_of_visit', 'reason', 'notes',
            'patient_id', 'doctor_id', 'department_id',
        ];
        const sets = [];
        const params = [];
        let idx = 1;
        for (const field of allowed) {
            if (req.body[field] !== undefined) {
                sets.push(`${field} = $${idx++}`);
                params.push(req.body[field]);
            }
        }
        if (sets.length === 0) {
            res.status(400).json({ success: false, message: 'No valid fields provided to update' });
            return;
        }
        sets.push('updated_at = CURRENT_TIMESTAMP');
        params.push(req.params.id);
        const result = await (0, database_1.query)(`UPDATE appointments SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Appointment not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.patchAppointment = patchAppointment;
// PATCH /appointments/:id/cancel
const cancelAppointment = async (req, res, next) => {
    try {
        const { cancellation_reason } = req.body;
        const cancelledBy = req.user?.userId;
        const result = await (0, database_1.query)(`UPDATE appointments
       SET status = 'cancelled',
           cancelled_by = $1,
           cancellation_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
         AND status NOT IN ('cancelled', 'completed', 'no_show')
       RETURNING *`, [cancelledBy ?? null, cancellation_reason ?? null, req.params.id]);
        if (result.rows.length === 0) {
            const exists = await (0, database_1.query)(`SELECT status FROM appointments WHERE id = $1`, [req.params.id]);
            if (exists.rows.length === 0) {
                res.status(404).json({ success: false, message: 'Appointment not found' });
            }
            else {
                res.status(409).json({ success: false, message: `Cannot cancel appointment with status: ${exists.rows[0].status}` });
            }
            return;
        }
        res.json({ success: true, message: 'Appointment cancelled successfully', data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.cancelAppointment = cancelAppointment;
// GET /appointments/categories  — static enum values for dropdowns
const getAppointmentCategories = async (_req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT DISTINCT specialization
       FROM doctors
       WHERE specialization IS NOT NULL AND specialization <> '' AND is_active = true
       ORDER BY specialization ASC`);
        res.json({
            success: true,
            data: {
                doctor_specializations: result.rows.map((r) => r.specialization),
            },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getAppointmentCategories = getAppointmentCategories;
//# sourceMappingURL=appointment.controller.js.map