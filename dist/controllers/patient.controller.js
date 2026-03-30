"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPatientMedicalHistory = exports.getPatientVisits = exports.getPatientAppointments = exports.deletePatient = exports.updatePatient = exports.updateMyProfile = exports.createPatient = exports.getPatientByUserId = exports.getPatientById = exports.searchPatientsByParams = exports.getPatients = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
// GET /patients  – paginated list
const getPatients = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
        const search = (req.query.search || '').trim();
        const offset = (page - 1) * limit;
        const searchClause = search
            ? `WHERE (p.first_name ILIKE $3 OR p.last_name ILIKE $3 OR p.patient_code ILIKE $3 OR p.phone ILIKE $3 OR p.email ILIKE $3)`
            : '';
        const params = [limit, offset];
        if (search)
            params.push(`%${search}%`);
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT p.*, CONCAT(p.first_name,' ',p.last_name) AS full_name,
                DATE_PART('year', AGE(p.date_of_birth))::INT AS age
         FROM patients p ${searchClause}
         ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`, params),
            (0, database_1.query)(`SELECT COUNT(*) FROM patients p ${searchClause}`, search ? [`%${search}%`] : []),
        ]);
        const total = parseInt(countRes.rows[0].count, 10);
        res.json({
            success: true,
            data: dataRes.rows,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getPatients = getPatients;
// GET /patients/search?first_name=&last_name=&gender=&blood_type=&phone=&email=&patient_code=&date_of_birth=&page=&limit=
const searchPatientsByParams = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
        const offset = (page - 1) * limit;
        const first_name = (req.query.first_name || '').trim();
        const last_name = (req.query.last_name || '').trim();
        const gender = (req.query.gender || '').trim();
        const blood_type = (req.query.blood_type || '').trim();
        const phone = (req.query.phone || '').trim();
        const email = (req.query.email || '').trim();
        const patient_code = (req.query.patient_code || '').trim();
        const date_of_birth = (req.query.date_of_birth || '').trim();
        // Collect filter pairs: [sql_clause_template, value]
        const filters = [];
        if (first_name)
            filters.push([`p.first_name ILIKE $IDX`, `%${first_name}%`]);
        if (last_name)
            filters.push([`p.last_name ILIKE $IDX`, `%${last_name}%`]);
        if (gender)
            filters.push([`p.gender = $IDX`, gender]);
        if (blood_type)
            filters.push([`p.blood_type ILIKE $IDX`, `%${blood_type}%`]);
        if (phone)
            filters.push([`p.phone ILIKE $IDX`, `%${phone}%`]);
        if (email)
            filters.push([`p.email ILIKE $IDX`, `%${email}%`]);
        if (patient_code)
            filters.push([`p.patient_code ILIKE $IDX`, `%${patient_code}%`]);
        if (date_of_birth)
            filters.push([`p.date_of_birth = $IDX`, date_of_birth]);
        const filterValues = filters.map(([, v]) => v);
        const dataConditions = filters.map(([clause], i) => clause.replace('$IDX', `$${3 + i}`));
        const countConditions = filters.map(([clause], i) => clause.replace('$IDX', `$${1 + i}`));
        const where = dataConditions.length ? `WHERE ${dataConditions.join(' AND ')}` : '';
        const countWhere = countConditions.length ? `WHERE ${countConditions.join(' AND ')}` : '';
        const dataParams = [limit, offset, ...filterValues];
        const countParams = [...filterValues];
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT p.*, CONCAT(p.first_name,' ',p.last_name) AS full_name,
                DATE_PART('year', AGE(p.date_of_birth))::INT AS age
         FROM patients p ${where}
         ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`, dataParams),
            (0, database_1.query)(`SELECT COUNT(*) FROM patients p ${countWhere}`, countParams),
        ]);
        const total = parseInt(countRes.rows[0].count, 10);
        res.json({
            success: true,
            data: dataRes.rows,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.searchPatientsByParams = searchPatientsByParams;
// GET /patients/:id
const getPatientById = async (req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT p.*,
              DATE_PART('year', AGE(p.date_of_birth))::INT AS age,
              json_agg(DISTINCT jsonb_build_object(
                'id',ui.id,'provider_id',ui.insurance_provider_id,
                'policy_number',ui.policy_number,'is_active',ui.is_active
              )) FILTER (WHERE ui.id IS NOT NULL) AS insurance
       FROM patients p
       LEFT JOIN user_insurances ui ON ui.patient_id = p.id
       WHERE p.id = $1
       GROUP BY p.id`, [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Patient not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.getPatientById = getPatientById;
// GET /patients/me
const getPatientByUserId = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const result = await (0, database_1.query)(`SELECT p.*,
              DATE_PART('year', AGE(p.date_of_birth))::INT AS age,
              json_agg(DISTINCT jsonb_build_object(
                'id',ui.id,'provider_id',ui.insurance_provider_id,
                'policy_number',ui.policy_number,'is_primary',ui.is_primary
              )) FILTER (WHERE ui.id IS NOT NULL) AS insurance
       FROM patients p
       LEFT JOIN user_insurances ui ON ui.patient_id = p.id
       WHERE p.user_id = $1
       GROUP BY p.id`, [userId]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Patient not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.getPatientByUserId = getPatientByUserId;
// POST /patients
const createPatient = async (req, res, next) => {
    try {
        const { first_name, last_name, email, phone, gender, date_of_birth, blood_type, address, emergency_contact_name, emergency_contact_phone, marital_status, password, } = req.body;
        const reqUser = req.user;
        const client = await (0, database_1.getClient)();
        try {
            await client.query('BEGIN');
            // 1. Create login account in users table
            const hash = await bcryptjs_1.default.hash(password, 12);
            const roleRes = await client.query(`SELECT id FROM roles WHERE name = 'patient' LIMIT 1`);
            const patientRoleId = roleRes.rows[0]?.id;
            const userRes = await client.query(`INSERT INTO users (organization_id, role_id, first_name, last_name, email, password_hash, phone, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`, [reqUser?.organizationId, patientRoleId, first_name, last_name, email, hash, phone, true]);
            const userId = userRes.rows[0].id;
            // 2. Create patient record linked to the user
            const patientRes = await client.query(`INSERT INTO patients
           (user_id, first_name, last_name, email, phone, gender, date_of_birth,
            blood_type, address, emergency_contact_name, emergency_contact_phone, marital_status,
            registered_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`, [userId, first_name, last_name, email, phone, gender, date_of_birth,
                blood_type, address, emergency_contact_name, emergency_contact_phone, marital_status,
                reqUser?.userId]);
            await client.query('COMMIT');
            res.status(201).json({ success: true, data: patientRes.rows[0] });
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
exports.createPatient = createPatient;
// PUT /patients/:id
// PUT /patients/me  – patient updates their own profile
const updateMyProfile = async (req, res, next) => {
    const client = await (0, database_1.getClient)();
    try {
        const userId = req.user?.userId;
        const { email, phone, gender, blood_type, address, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, marital_status, occupation, nationality, } = req.body;
        await client.query('BEGIN');
        if (email !== undefined) {
            await client.query(`UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [email, userId]);
        }
        const result = await client.query(`UPDATE patients
       SET email                  = COALESCE($1,  email),
           phone                  = COALESCE($2,  phone),
           gender                 = COALESCE($3,  gender),
           blood_type             = COALESCE($4,  blood_type),
           address                = COALESCE($5,  address),
           emergency_contact_name = COALESCE($6,  emergency_contact_name),
           emergency_contact_phone= COALESCE($7,  emergency_contact_phone),
           emergency_contact_relation = COALESCE($8, emergency_contact_relation),
           marital_status         = COALESCE($9,  marital_status),
           occupation             = COALESCE($10, occupation),
           nationality            = COALESCE($11, nationality),
           updated_at             = CURRENT_TIMESTAMP
       WHERE user_id = $12
       RETURNING *`, [email, phone, gender,
            blood_type, address, emergency_contact_name, emergency_contact_phone,
            emergency_contact_relation, marital_status, occupation, nationality, userId]);
        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            res.status(404).json({ success: false, message: 'Patient not found' });
            return;
        }
        await client.query('COMMIT');
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        await client.query('ROLLBACK');
        next(err);
    }
    finally {
        client.release();
    }
};
exports.updateMyProfile = updateMyProfile;
const updatePatient = async (req, res, next) => {
    try {
        const { first_name, last_name, email, phone, gender, date_of_birth, blood_group, address, emergency_contact_name, emergency_contact_phone, marital_status, is_active, } = req.body;
        const result = await (0, database_1.query)(`UPDATE patients
       SET first_name=$1, last_name=$2, email=$3, phone=$4, gender=$5,
           date_of_birth=$6, blood_group=$7, address=$8,
           emergency_contact_name=$9, emergency_contact_phone=$10,
           marital_status=$11, is_active=$12
       WHERE id = $13
       RETURNING *`, [first_name, last_name, email, phone, gender, date_of_birth,
            blood_group, address, emergency_contact_name, emergency_contact_phone,
            marital_status, is_active, req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Patient not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.updatePatient = updatePatient;
// DELETE /patients/:id  (soft delete – set status = inactive)
const deletePatient = async (req, res, next) => {
    try {
        const result = await (0, database_1.query)(`UPDATE patients SET is_active = FALSE WHERE id = $1 RETURNING id`, [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Patient not found' });
            return;
        }
        res.json({ success: true, message: 'Patient deactivated' });
    }
    catch (err) {
        next(err);
    }
};
exports.deletePatient = deletePatient;
// GET /patients/:id/appointments
const getPatientAppointments = async (req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT a.*, CONCAT(u.first_name,' ',u.last_name) AS doctor_name, d.name AS department
       FROM appointments a
       JOIN doctors doc ON doc.id = a.doctor_id
       JOIN users u ON u.id = doc.user_id
       LEFT JOIN departments d ON d.id = a.department_id
       WHERE a.patient_id = $1
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`, [req.params.id]);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        next(err);
    }
};
exports.getPatientAppointments = getPatientAppointments;
// GET /patients/:id/encounters
const getPatientVisits = async (req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT e.*, CONCAT(u.first_name,' ',u.last_name) AS doctor_name
       FROM encounters e
       JOIN doctors doc ON doc.id = e.doctor_id
       JOIN users u ON u.id = doc.user_id
       WHERE e.patient_id = $1
       ORDER BY e.encounter_date DESC`, [req.params.id]);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        next(err);
    }
};
exports.getPatientVisits = getPatientVisits;
// GET /patients/:id/medical-history  (diagnoses + prescriptions)
const getPatientMedicalHistory = async (req, res, next) => {
    try {
        const [diagRes, prescRes, labRes] = await Promise.all([
            (0, database_1.query)(`SELECT diag.*, CONCAT(u.first_name,' ',u.last_name) AS doctor_name
         FROM diagnoses diag
         JOIN doctors doc ON doc.id = diag.doctor_id
         JOIN users u ON u.id = doc.user_id
         WHERE diag.patient_id = $1
         ORDER BY diag.diagnosed_date DESC`, [req.params.id]),
            (0, database_1.query)(`SELECT p.*, CONCAT(u.first_name,' ',u.last_name) AS doctor_name
         FROM prescriptions p
         JOIN doctors doc ON doc.id = p.doctor_id
         JOIN users u ON u.id = doc.user_id
         WHERE p.patient_id = $1
         ORDER BY p.prescription_date DESC`, [req.params.id]),
            (0, database_1.query)(`SELECT lo.*, CONCAT(u.first_name,' ',u.last_name) AS doctor_name
         FROM lab_orders lo
         JOIN doctors doc ON doc.id = lo.doctor_id
         JOIN users u ON u.id = doc.user_id
         WHERE lo.patient_id = $1
         ORDER BY lo.order_date DESC`, [req.params.id]),
        ]);
        res.json({
            success: true,
            data: { diagnoses: diagRes.rows, prescriptions: prescRes.rows, lab_orders: labRes.rows },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getPatientMedicalHistory = getPatientMedicalHistory;
//# sourceMappingURL=patient.controller.js.map