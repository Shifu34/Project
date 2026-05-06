"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllSpecializations = exports.getDoctorSpecialization = exports.getDoctorBookedAppointments = exports.deleteDoctorSchedule = exports.updateDoctorSchedule = exports.getDoctorAvailableSlots = exports.addDoctorSchedule = exports.upsertDoctorProfileByDoctor = exports.getDoctorScheduleByDate = exports.getDoctorProfile = exports.searchAvailableDoctors = exports.searchDoctors = exports.getDoctorAppointments = exports.updateDoctor = exports.createDoctor = exports.getDoctorByUserId = exports.getDoctorById = exports.getDoctors = exports.getDoctorDeptStats = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
const canDoctorManageProfile = async (req, doctorId) => {
    if (!req.user)
        return false;
    if (req.user.roleName === 'admin')
        return true;
    if (req.user.roleName !== 'doctor')
        return false;
    const ownDoctor = await (0, database_1.query)(`SELECT id FROM doctors WHERE user_id = $1 LIMIT 1`, [req.user.userId]);
    if (ownDoctor.rows.length === 0)
        return false;
    return Number(ownDoctor.rows[0].id) === doctorId;
};
// GET /doctors/stats/departments — department distribution for charts
const getDoctorDeptStats = async (_req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT dept.name AS department, COUNT(d.id)::int AS count
       FROM doctors d
       LEFT JOIN departments dept ON dept.id = d.department_id
       GROUP BY dept.name
       ORDER BY count DESC`, []);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        next(err);
    }
};
exports.getDoctorDeptStats = getDoctorDeptStats;
// GET /doctors
const getDoctors = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
        const search = (req.query.search || '').trim();
        const department = (req.query.department_id || '');
        const offset = (page - 1) * limit;
        const conditions = [];
        const params = [limit, offset];
        let idx = 3;
        if (search) {
            conditions.push(`(u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx} OR d.specialization ILIKE $${idx})`);
            params.push(`%${search}%`);
            idx++;
        }
        if (department) {
            conditions.push(`d.department_id = $${idx}`);
            params.push(department);
            idx++;
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT d.id, d.user_id, d.specialization, d.license_number, d.qualification,
                d.experience_years, d.consultation_fee, d.is_active,
                COALESCE(u.first_name, d.first_name) AS first_name,
                COALESCE(u.last_name,  d.last_name)  AS last_name,
                COALESCE(u.email,      d.email)       AS email,
                COALESCE(u.phone,      d.phone)       AS phone,
                dept.name AS department
         FROM doctors d
         LEFT JOIN users u ON u.id = d.user_id
         LEFT JOIN departments dept ON dept.id = d.department_id
         ${where}
         ORDER BY COALESCE(u.first_name, d.first_name) ASC LIMIT $1 OFFSET $2`, params),
            (0, database_1.query)(`SELECT COUNT(*) FROM doctors d
         LEFT JOIN users u ON u.id = d.user_id
         LEFT JOIN departments dept ON dept.id = d.department_id ${where}`, conditions.length ? params.slice(2) : []),
        ]);
        const total = parseInt(countRes.rows[0].count, 10);
        res.json({ success: true, data: dataRes.rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    }
    catch (err) {
        next(err);
    }
};
exports.getDoctors = getDoctors;
// GET /doctors/:id
const getDoctorById = async (req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT d.*,
              COALESCE(u.first_name, d.first_name) AS first_name,
              COALESCE(u.last_name,  d.last_name)  AS last_name,
              COALESCE(u.email,      d.email)       AS email,
              COALESCE(u.phone,      d.phone)       AS phone,
              COALESCE(u.is_active,  d.is_active)   AS is_active,
              dept.name AS department
       FROM doctors d
       LEFT JOIN users u ON u.id = d.user_id
       LEFT JOIN departments dept ON dept.id = d.department_id
       WHERE d.id = $1`, [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Doctor not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.getDoctorById = getDoctorById;
// GET /doctors/me
const getDoctorByUserId = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const result = await (0, database_1.query)(`SELECT d.*,
              COALESCE(u.first_name, d.first_name) AS first_name,
              COALESCE(u.last_name,  d.last_name)  AS last_name,
              COALESCE(u.email,      d.email)       AS email,
              COALESCE(u.phone,      d.phone)       AS phone,
              COALESCE(u.is_active,  d.is_active)   AS is_active,
              dept.name AS department
       FROM doctors d
       LEFT JOIN users u ON u.id = d.user_id
       LEFT JOIN departments dept ON dept.id = d.department_id
       WHERE d.user_id = $1`, [userId]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Doctor not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.getDoctorByUserId = getDoctorByUserId;
// POST /doctors  – creates user + doctor profile atomically
const createDoctor = async (req, res, next) => {
    try {
        const { first_name, last_name, email, password, phone, gender, date_of_birth, address, department_id, specialization, license_number, qualification, experience_years, consultation_fee, bio, } = req.body;
        const reqUser = req.user;
        const client = await (0, database_1.getClient)();
        try {
            await client.query('BEGIN');
            const hash = await bcryptjs_1.default.hash(password || 'Doctor@123', 12);
            const userRes = await client.query(`INSERT INTO users (role_id, first_name, last_name, email, password_hash, phone, is_active)
         VALUES ((SELECT id FROM roles WHERE name='doctor'),$1,$2,$3,$4,$5,true)
         RETURNING id`, [first_name, last_name, email, hash, phone]);
            const userId = userRes.rows[0].id;
            const docRes = await client.query(`INSERT INTO doctors
           (user_id, first_name, last_name, email, phone, gender, date_of_birth,
            department_id, specialization, license_number, qualification,
            experience_years, consultation_fee, bio)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`, [userId, first_name, last_name, email, phone, gender ?? null, date_of_birth ?? null,
                department_id ?? null, specialization ?? null, license_number ?? null, qualification ?? null,
                experience_years ?? null, consultation_fee ?? null, bio ?? null]);
            await client.query('COMMIT');
            res.status(201).json({ success: true, data: docRes.rows[0] });
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        next(err);
    }
};
exports.createDoctor = createDoctor;
// PUT /doctors/:id
const updateDoctor = async (req, res, next) => {
    try {
        const { department_id, specialization, license_number, qualification, experience_years, consultation_fee, bio, } = req.body;
        const result = await (0, database_1.query)(`UPDATE doctors
       SET department_id=$1, specialization=$2, license_number=$3, qualification=$4,
           experience_years=$5, consultation_fee=$6, bio=$7
       WHERE id = $8 RETURNING *`, [department_id, specialization, license_number, qualification,
            experience_years, consultation_fee, bio, req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Doctor not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.updateDoctor = updateDoctor;
// GET /doctors/:id/appointments  (today or by date)
const getDoctorAppointments = async (req, res, next) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        const result = await (0, database_1.query)(`SELECT a.*, CONCAT(p.first_name,' ',p.last_name) AS patient_name,
              p.patient_code, p.phone AS patient_phone
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       WHERE a.doctor_id = $1 AND a.appointment_date = $2
       ORDER BY a.appointment_time ASC`, [req.params.id, date]);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        next(err);
    }
};
exports.getDoctorAppointments = getDoctorAppointments;
// GET /doctors/search  — public, no auth required
// Query params: search (searches name, specialization, department), page, limit
const searchDoctors = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
        const search = (req.query.search || '').trim();
        const offset = (page - 1) * limit;
        const dataConditions = ['d.is_active = true'];
        const dataParams = [limit, offset];
        let dataIdx = 3;
        const countConditions = ['d.is_active = true'];
        const countParams = [];
        let countIdx = 1;
        if (search) {
            const clause = `(CONCAT(COALESCE(u.first_name, d.first_name),' ',COALESCE(u.last_name, d.last_name)) ILIKE '%' || $${dataIdx} || '%' OR d.specialization ILIKE '%' || $${dataIdx} || '%' OR $${dataIdx} ILIKE '%' || d.specialization || '%' OR dept.name ILIKE '%' || $${dataIdx} || '%')`;
            dataConditions.push(clause);
            dataParams.push(search);
            dataIdx++;
            const cClause = `(CONCAT(COALESCE(u.first_name, d.first_name),' ',COALESCE(u.last_name, d.last_name)) ILIKE '%' || $${countIdx} || '%' OR d.specialization ILIKE '%' || $${countIdx} || '%' OR $${countIdx} ILIKE '%' || d.specialization || '%' OR dept.name ILIKE '%' || $${countIdx} || '%')`;
            countConditions.push(cClause);
            countParams.push(search);
            countIdx++;
        }
        const where = `WHERE ${dataConditions.join(' AND ')}`;
        const countWhere = `WHERE ${countConditions.join(' AND ')}`;
        const baseJoin = `
      FROM doctors d
      LEFT JOIN users u    ON u.id    = d.user_id
      LEFT JOIN departments dept ON dept.id = d.department_id`;
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT
           d.id, d.specialization, d.qualification, d.experience_years,
           d.consultation_fee, d.is_active,
           COALESCE(u.first_name, d.first_name) AS first_name,
           COALESCE(u.last_name,  d.last_name)  AS last_name,
           COALESCE(u.email,      d.email)       AS email,
           COALESCE(u.phone,      d.phone)       AS phone,
           dept.id AS department_id, dept.name AS department, dept.location
         ${baseJoin}
         ${where}
         ORDER BY COALESCE(u.first_name, d.first_name) ASC
         LIMIT $1 OFFSET $2`, dataParams),
            (0, database_1.query)(`SELECT COUNT(*) ${baseJoin} ${countWhere}`, countParams),
        ]);
        // Fetch all available schedules for matched doctors
        const doctorIds = dataRes.rows.map((r) => r.id);
        let scheduleMap = {};
        if (doctorIds.length > 0) {
            const schedRes = await (0, database_1.query)(`SELECT id, doctor_id, day_of_week, appointment_type, start_time, end_time, max_appointments
         FROM doctor_schedules
         WHERE doctor_id = ANY($1::int[])
           AND is_available = true
         ORDER BY day_of_week, start_time`, [doctorIds]);
            for (const row of schedRes.rows) {
                if (!scheduleMap[row.doctor_id])
                    scheduleMap[row.doctor_id] = [];
                scheduleMap[row.doctor_id].push({
                    schedule_id: row.id,
                    day_of_week: row.day_of_week,
                    dates: [],
                    start_time: row.start_time,
                    end_time: row.end_time,
                    appointment_type: row.appointment_type,
                    max_appointments: row.max_appointments,
                });
            }
        }
        const total = parseInt(countRes.rows[0].count, 10);
        res.json({
            success: true,
            data: dataRes.rows.map((doc) => ({
                ...doc,
                available_schedules: scheduleMap[doc.id] || [],
            })),
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.searchDoctors = searchDoctors;
// GET /doctors/search-available?dates=2026-03-25,2026-03-27&category=Cardiologist&location=...&name=...&department=...
const searchAvailableDoctors = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
        const offset = (page - 1) * limit;
        const name = (req.query.name || '').trim();
        const category = (req.query.category || '').trim();
        const department = (req.query.department || '').trim();
        const location = (req.query.location || '').trim();
        // Accept dates as comma-separated string or repeated param: dates=2026-03-25,2026-03-27
        const rawDates = req.query.dates;
        let dateList = [];
        if (Array.isArray(rawDates)) {
            dateList = rawDates.flatMap(d => d.split(','));
        }
        else if (rawDates) {
            dateList = rawDates.split(',');
        }
        dateList = dateList.map(d => d.trim()).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
        // Convert dates → unique day-of-week names, keep a date→day map for response
        const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dateToDayMap = {};
        for (const d of dateList) {
            dateToDayMap[d] = DAY_NAMES[new Date(`${d}T00:00:00`).getDay()];
        }
        const dayOfWeekList = [...new Set(Object.values(dateToDayMap))];
        const dataConditions = ['d.is_active = true'];
        const dataParams = [limit, offset];
        let dataIdx = 3;
        const countConditions = ['d.is_active = true'];
        const countParams = [];
        let countIdx = 1;
        // Must have an available schedule on one of the requested days
        if (dayOfWeekList.length > 0) {
            const clause = `EXISTS (
        SELECT 1 FROM doctor_schedules ds
        WHERE ds.doctor_id = d.id
          AND ds.is_available = true
          AND ds.day_of_week = ANY($${dataIdx}::text[])
      )`;
            dataConditions.push(clause);
            dataParams.push(dayOfWeekList);
            dataIdx++;
            const cClause = `EXISTS (
        SELECT 1 FROM doctor_schedules ds
        WHERE ds.doctor_id = d.id
          AND ds.is_available = true
          AND ds.day_of_week = ANY($${countIdx}::text[])
      )`;
            countConditions.push(cClause);
            countParams.push(dayOfWeekList);
            countIdx++;
        }
        if (name) {
            const clause = `CONCAT(COALESCE(u.first_name, d.first_name),' ',COALESCE(u.last_name, d.last_name)) ILIKE $${dataIdx}`;
            dataConditions.push(clause);
            dataParams.push(`%${name}%`);
            dataIdx++;
            const cClause = `CONCAT(COALESCE(u.first_name, d.first_name),' ',COALESCE(u.last_name, d.last_name)) ILIKE $${countIdx}`;
            countConditions.push(cClause);
            countParams.push(`%${name}%`);
            countIdx++;
        }
        if (category) {
            dataConditions.push(`(d.specialization ILIKE '%' || $${dataIdx} || '%' OR $${dataIdx} ILIKE '%' || d.specialization || '%')`);
            dataParams.push(category);
            dataIdx++;
            countConditions.push(`(d.specialization ILIKE '%' || $${countIdx} || '%' OR $${countIdx} ILIKE '%' || d.specialization || '%')`);
            countParams.push(category);
            countIdx++;
        }
        if (department) {
            dataConditions.push(`dept.name ILIKE $${dataIdx}`);
            dataParams.push(`%${department}%`);
            dataIdx++;
            countConditions.push(`dept.name ILIKE $${countIdx}`);
            countParams.push(`%${department}%`);
            countIdx++;
        }
        if (location) {
            dataConditions.push(`dept.location ILIKE $${dataIdx}`);
            dataParams.push(`%${location}%`);
            dataIdx++;
            countConditions.push(`dept.location ILIKE $${countIdx}`);
            countParams.push(`%${location}%`);
            countIdx++;
        }
        const where = `WHERE ${dataConditions.join(' AND ')}`;
        const countWhere = `WHERE ${countConditions.join(' AND ')}`;
        const baseJoin = `
      FROM doctors d
      LEFT JOIN users u         ON u.id    = d.user_id
      LEFT JOIN departments dept ON dept.id = d.department_id`;
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT
           d.id, d.specialization, d.qualification, d.experience_years,
           d.consultation_fee, d.is_active,
           COALESCE(u.first_name, d.first_name) AS first_name,
           COALESCE(u.last_name,  d.last_name)  AS last_name,
           COALESCE(u.email,      d.email)       AS email,
           COALESCE(u.phone,      d.phone)       AS phone,
           dept.id AS department_id, dept.name AS department, dept.location
         ${baseJoin}
         ${where}
         ORDER BY COALESCE(u.first_name, d.first_name) ASC
         LIMIT $1 OFFSET $2`, dataParams),
            (0, database_1.query)(`SELECT COUNT(*) ${baseJoin} ${countWhere}`, countParams),
        ]);
        // Fetch schedules for all matched doctors on the requested days
        const doctorIds = dataRes.rows.map((r) => r.id);
        let scheduleMap = {};
        if (doctorIds.length > 0 && dayOfWeekList.length > 0) {
            const schedRes = await (0, database_1.query)(`SELECT id, doctor_id, day_of_week, appointment_type, start_time, end_time, max_appointments
         FROM doctor_schedules
         WHERE doctor_id = ANY($1::int[])
           AND is_available = true
           AND day_of_week = ANY($2::text[])
         ORDER BY day_of_week, start_time`, [doctorIds, dayOfWeekList]);
            for (const row of schedRes.rows) {
                if (!scheduleMap[row.doctor_id])
                    scheduleMap[row.doctor_id] = [];
                // Find the matching dates for this day_of_week
                const matchingDates = dateList.filter(d => dateToDayMap[d] === row.day_of_week);
                scheduleMap[row.doctor_id].push({
                    schedule_id: row.id,
                    day_of_week: row.day_of_week,
                    dates: matchingDates,
                    start_time: row.start_time,
                    end_time: row.end_time,
                    appointment_type: row.appointment_type,
                    max_appointments: row.max_appointments,
                });
            }
        }
        const total = parseInt(countRes.rows[0].count, 10);
        const doctors = dataRes.rows.map((doc) => ({
            ...doc,
            available_schedules: scheduleMap[doc.id] || [],
        }));
        res.json({
            success: true,
            data: doctors,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.searchAvailableDoctors = searchAvailableDoctors;
// GET /doctors/:id/profile
const getDoctorProfile = async (req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT d.id, d.user_id,
              COALESCE(u.first_name, d.first_name) AS first_name,
              COALESCE(u.last_name,  d.last_name)  AS last_name,
              COALESCE(u.email,      d.email)      AS email,
              COALESCE(u.phone,      d.phone)      AS phone,
              d.gender, d.date_of_birth, d.specialization, d.license_number,
              d.qualification, d.experience_years, d.consultation_fee,
              d.bio AS about, d.is_active,
              dept.id AS department_id,
              dept.name AS department,
              d.created_at, d.updated_at
       FROM doctors d
       LEFT JOIN users u ON u.id = d.user_id
       LEFT JOIN departments dept ON dept.id = d.department_id
       WHERE d.id = $1
       LIMIT 1`, [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Doctor not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.getDoctorProfile = getDoctorProfile;
// GET /doctors/:id/schedule
const getDoctorScheduleByDate = async (req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT id, doctor_id, day_of_week, appointment_type,
              start_time, end_time, max_appointments, is_available
       FROM doctor_schedules
       WHERE doctor_id = $1
       ORDER BY
         CASE day_of_week
           WHEN 'Monday'    THEN 1
           WHEN 'Tuesday'   THEN 2
           WHEN 'Wednesday' THEN 3
           WHEN 'Thursday'  THEN 4
           WHEN 'Friday'    THEN 5
           WHEN 'Saturday'  THEN 6
           WHEN 'Sunday'    THEN 7
         END,
         start_time ASC`, [req.params.id]);
        res.json({
            success: true,
            data: {
                doctor_id: Number(req.params.id),
                schedules: result.rows,
            },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getDoctorScheduleByDate = getDoctorScheduleByDate;
// POST /doctors/:id/profile
const upsertDoctorProfileByDoctor = async (req, res, next) => {
    try {
        const doctorId = parseInt(req.params.id, 10);
        const allowed = await canDoctorManageProfile(req, doctorId);
        if (!allowed) {
            res.status(403).json({ success: false, message: 'You can only update your own profile' });
            return;
        }
        const { first_name, last_name, email, phone, gender, date_of_birth, department_id, specialization, license_number, qualification, experience_years, consultation_fee, about, } = req.body;
        const result = await (0, database_1.query)(`UPDATE doctors
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           email = COALESCE($3, email),
           phone = COALESCE($4, phone),
           gender = COALESCE($5, gender),
           date_of_birth = COALESCE($6, date_of_birth),
           department_id = COALESCE($7, department_id),
           specialization = COALESCE($8, specialization),
           license_number = COALESCE($9, license_number),
           qualification = COALESCE($10, qualification),
           experience_years = COALESCE($11, experience_years),
           consultation_fee = COALESCE($12, consultation_fee),
           bio = COALESCE($13, bio),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $14
       RETURNING *`, [
            first_name ?? null,
            last_name ?? null,
            email ?? null,
            phone ?? null,
            gender ?? null,
            date_of_birth ?? null,
            department_id ?? null,
            specialization ?? null,
            license_number ?? null,
            qualification ?? null,
            experience_years ?? null,
            consultation_fee ?? null,
            about ?? null,
            doctorId,
        ]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Doctor not found' });
            return;
        }
        const doc = result.rows[0];
        if (doc.user_id) {
            await (0, database_1.query)(`UPDATE users
         SET first_name = COALESCE($1, first_name),
             last_name = COALESCE($2, last_name),
             email = COALESCE($3, email),
             phone = COALESCE($4, phone),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`, [first_name ?? null, last_name ?? null, email ?? null, phone ?? null, doc.user_id]);
        }
        res.json({ success: true, message: 'Doctor profile updated successfully', data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.upsertDoctorProfileByDoctor = upsertDoctorProfileByDoctor;
// POST /doctors/:id/schedule
// Accepts: { schedules: [{ day, start_time, end_time, slot_duration, appointment_type }] }
const addDoctorSchedule = async (req, res, next) => {
    try {
        const doctorId = parseInt(req.params.id, 10);
        const allowed = await canDoctorManageProfile(req, doctorId);
        if (!allowed) {
            res.status(403).json({ success: false, message: 'You can only manage your own schedule' });
            return;
        }
        const { schedules } = req.body;
        const entries = Array.isArray(schedules) ? schedules : [];
        if (entries.length === 0) {
            res.status(400).json({ success: false, message: 'schedules must be a non-empty array' });
            return;
        }
        const typeMap = {
            clinic: 'In-clinic Visit',
            online: 'Online Consultation',
            'in-clinic visit': 'In-clinic Visit',
            'online consultation': 'Online Consultation',
        };
        const updatedRows = [];
        for (const entry of entries) {
            const { day, start_time, end_time, slot_duration, appointment_type } = entry;
            if (!day || !start_time || !end_time) {
                res.status(400).json({ success: false, message: 'Each schedule must include day, start_time, and end_time' });
                return;
            }
            const normalizedDay = String(day).charAt(0).toUpperCase() + String(day).slice(1).toLowerCase();
            const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            if (!validDays.includes(normalizedDay)) {
                res.status(400).json({ success: false, message: `Invalid day: ${day}. Must be a full day name (e.g. Monday)` });
                return;
            }
            const mappedType = typeMap[(String(appointment_type || 'online')).toLowerCase()] || 'Online Consultation';
            // Calculate max_appointments from slot_duration if provided
            let maxAppointments = 20;
            if (slot_duration && slot_duration > 0) {
                const [sh, sm] = start_time.split(':').map(Number);
                const [eh, em] = end_time.split(':').map(Number);
                const totalMinutes = (eh * 60 + em) - (sh * 60 + sm);
                if (totalMinutes > 0) {
                    maxAppointments = Math.floor(totalMinutes / slot_duration);
                }
            }
            const upsert = await (0, database_1.query)(`INSERT INTO doctor_schedules
           (doctor_id, day_of_week, appointment_type, start_time, end_time, max_appointments, is_available)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING *`, [doctorId, normalizedDay, mappedType, start_time, end_time, maxAppointments]);
            updatedRows.push(upsert.rows[0]);
        }
        res.status(201).json({
            success: true,
            message: 'Doctor schedule saved successfully',
            data: {
                doctor_id: doctorId,
                schedules: updatedRows,
            },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.addDoctorSchedule = addDoctorSchedule;
// GET /doctors/:id/available-slots?date=YYYY-MM-DD
const getDoctorAvailableSlots = async (req, res, next) => {
    try {
        const doctorId = req.params.id;
        const date = req.query.date || new Date().toISOString().split('T')[0];
        const d = new Date(`${date}T00:00:00`);
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayOfWeek = dayNames[d.getDay()];
        const [scheduleRes, bookedRes] = await Promise.all([
            (0, database_1.query)(`SELECT id, appointment_type, start_time, end_time
         FROM doctor_schedules
         WHERE doctor_id = $1 AND day_of_week = $2 AND is_available = true`, [doctorId, dayOfWeek]),
            (0, database_1.query)(`SELECT appointment_time
         FROM appointments
         WHERE doctor_id = $1 AND appointment_date = $2
           AND status NOT IN ('cancelled', 'no_show')`, [doctorId, date]),
        ]);
        const bookedTimes = new Set(bookedRes.rows.map(r => String(r.appointment_time).slice(0, 5)));
        const availableSlots = [];
        for (const sched of scheduleRes.rows) {
            const [sh, sm] = String(sched.start_time).split(':').map(Number);
            const [eh, em] = String(sched.end_time).split(':').map(Number);
            let current = sh * 60 + sm;
            const end = eh * 60 + em;
            while (current + 30 <= end) {
                const hh = String(Math.floor(current / 60)).padStart(2, '0');
                const mm = String(current % 60).padStart(2, '0');
                const timeStr = `${hh}:${mm}`;
                if (!bookedTimes.has(timeStr)) {
                    availableSlots.push({ schedule_id: sched.id, appointment_type: sched.appointment_type, time: timeStr });
                }
                current += 30;
            }
        }
        res.json({
            success: true,
            data: { doctor_id: Number(doctorId), date, day_of_week: dayOfWeek, available_slots: availableSlots },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getDoctorAvailableSlots = getDoctorAvailableSlots;
// PATCH /doctors/schedule/:scheduleId  — partial update by schedule id
const updateDoctorSchedule = async (req, res, next) => {
    try {
        const scheduleId = parseInt(req.params.scheduleId, 10);
        const scheduleRes = await (0, database_1.query)(`SELECT * FROM doctor_schedules WHERE id = $1`, [scheduleId]);
        if (scheduleRes.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Schedule not found' });
            return;
        }
        const doctorId = scheduleRes.rows[0].doctor_id;
        const allowed = await canDoctorManageProfile(req, doctorId);
        if (!allowed) {
            res.status(403).json({ success: false, message: 'You can only update your own schedule' });
            return;
        }
        const typeMap = {
            clinic: 'In-clinic Visit',
            online: 'Online Consultation',
            'in-clinic visit': 'In-clinic Visit',
            'online consultation': 'Online Consultation',
        };
        const allowedFields = ['day_of_week', 'appointment_type', 'start_time', 'end_time', 'max_appointments', 'is_available'];
        const sets = [];
        const params = [];
        let idx = 1;
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                let val = req.body[field];
                if (field === 'appointment_type')
                    val = typeMap[String(val).toLowerCase()] ?? val;
                if (field === 'day_of_week')
                    val = String(val).charAt(0).toUpperCase() + String(val).slice(1).toLowerCase();
                sets.push(`${field} = $${idx++}`);
                params.push(val);
            }
        }
        if (sets.length === 0) {
            res.status(400).json({ success: false, message: 'No valid fields provided to update' });
            return;
        }
        sets.push('updated_at = CURRENT_TIMESTAMP');
        params.push(scheduleId);
        const result = await (0, database_1.query)(`UPDATE doctor_schedules SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
        res.json({ success: true, message: 'Schedule updated successfully', data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.updateDoctorSchedule = updateDoctorSchedule;
// DELETE /doctors/schedule/:scheduleId
const deleteDoctorSchedule = async (req, res, next) => {
    try {
        const scheduleId = parseInt(req.params.scheduleId, 10);
        const scheduleRes = await (0, database_1.query)(`SELECT * FROM doctor_schedules WHERE id = $1`, [scheduleId]);
        if (scheduleRes.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Schedule not found' });
            return;
        }
        const doctorId = scheduleRes.rows[0].doctor_id;
        const allowed = await canDoctorManageProfile(req, doctorId);
        if (!allowed) {
            res.status(403).json({ success: false, message: 'You can only delete your own schedule' });
            return;
        }
        await (0, database_1.query)(`DELETE FROM doctor_schedules WHERE id = $1`, [scheduleId]);
        res.json({ success: true, message: 'Schedule deleted successfully' });
    }
    catch (err) {
        next(err);
    }
};
exports.deleteDoctorSchedule = deleteDoctorSchedule;
// GET /doctors/:id/booked-appointments?date=YYYY-MM-DD
const getDoctorBookedAppointments = async (req, res, next) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        const result = await (0, database_1.query)(`SELECT a.id, a.appointment_date, a.appointment_time, a.duration_minutes,
              a.appointment_type, nov.name AS nature_of_visit, a.nature_of_visit_id, a.status, a.reason,
              p.id AS patient_id,
              CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
              p.patient_code, p.phone AS patient_phone
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN nature_of_visit nov ON nov.id = a.nature_of_visit_id
       WHERE a.doctor_id = $1
         AND a.appointment_date = $2
         AND a.status NOT IN ('cancelled', 'no_show')
       ORDER BY a.appointment_time ASC`, [req.params.id, date]);
        res.json({ success: true, data: { doctor_id: Number(req.params.id), date, appointments: result.rows } });
    }
    catch (err) {
        next(err);
    }
};
exports.getDoctorBookedAppointments = getDoctorBookedAppointments;
// GET /doctors/:id/specialization — get a specific doctor's specialization
const getDoctorSpecialization = async (req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT d.id, d.specialization,
              CONCAT(COALESCE(u.first_name, d.first_name), ' ', COALESCE(u.last_name, d.last_name)) AS doctor_name
       FROM doctors d
       LEFT JOIN users u ON u.id = d.user_id
       WHERE d.id = $1`, [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Doctor not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.getDoctorSpecialization = getDoctorSpecialization;
// GET /doctors/specializations — get all distinct specializations
const getAllSpecializations = async (_req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT DISTINCT specialization
       FROM doctors
       WHERE specialization IS NOT NULL AND specialization <> ''
       ORDER BY specialization ASC`);
        res.json({ success: true, data: result.rows.map(r => r.specialization) });
    }
    catch (err) {
        next(err);
    }
};
exports.getAllSpecializations = getAllSpecializations;
//# sourceMappingURL=doctor.controller.js.map