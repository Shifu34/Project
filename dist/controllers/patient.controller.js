"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPatientPrescriptions = exports.getPatientRadiologyOrders = exports.getPatientLabOrders = exports.getPatientEncounters = exports.getPatientMedicalHistory = exports.getPatientVisits = exports.getPatientAppointments = exports.deletePatient = exports.updatePatient = exports.updateMyProfile = exports.createPatient = exports.getPatientByUserId = exports.getPatientById = exports.searchPatientsByParams = exports.getPatients = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
// GET /patients  – paginated list
const getPatients = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
        const search = (req.query.search || '').trim();
        const offset = (page - 1) * limit;
        // If caller is a doctor, restrict to patients they have appointments with
        let doctorId = null;
        if (req.user?.roleName === 'doctor') {
            const docRes = await (0, database_1.query)(`SELECT id FROM doctors WHERE user_id = $1 LIMIT 1`, [req.user.userId]);
            if (docRes.rows.length === 0) {
                res.status(404).json({ success: false, message: 'Doctor profile not found' });
                return;
            }
            doctorId = docRes.rows[0].id;
        }
        const dataValues = [limit, offset];
        const countValues = [];
        const dataClauses = [];
        const countClauses = [];
        if (doctorId !== null) {
            dataClauses.push(`p.id IN (SELECT DISTINCT patient_id FROM appointments WHERE doctor_id = $${dataValues.length + 1})`);
            dataValues.push(doctorId);
            countClauses.push(`p.id IN (SELECT DISTINCT patient_id FROM appointments WHERE doctor_id = $${countValues.length + 1})`);
            countValues.push(doctorId);
        }
        if (search) {
            const s = `%${search}%`;
            const searchSql = (n) => `(p.first_name ILIKE $${n} OR p.last_name ILIKE $${n} OR p.patient_code ILIKE $${n} OR p.phone ILIKE $${n} OR p.email ILIKE $${n})`;
            dataClauses.push(searchSql(dataValues.length + 1));
            dataValues.push(s);
            countClauses.push(searchSql(countValues.length + 1));
            countValues.push(s);
        }
        const where = dataClauses.length ? `WHERE ${dataClauses.join(' AND ')}` : '';
        const countWhere = countClauses.length ? `WHERE ${countClauses.join(' AND ')}` : '';
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT p.*, CONCAT(p.first_name,' ',p.last_name) AS full_name,
                DATE_PART('year', AGE(p.date_of_birth))::INT AS age
         FROM patients p ${where}
         ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`, dataValues),
            (0, database_1.query)(`SELECT COUNT(*) FROM patients p ${countWhere}`, countValues),
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
        // If caller is a doctor, restrict to their own patients
        let doctorId = null;
        if (req.user?.roleName === 'doctor') {
            const docRes = await (0, database_1.query)(`SELECT id FROM doctors WHERE user_id = $1 LIMIT 1`, [req.user.userId]);
            if (docRes.rows.length === 0) {
                res.status(404).json({ success: false, message: 'Doctor profile not found' });
                return;
            }
            doctorId = docRes.rows[0].id;
        }
        const dataValues = [limit, offset];
        const countValues = [];
        const dataClauses = [];
        const countClauses = [];
        const addFilter = (sql, value) => {
            dataClauses.push(sql.replace('?', `$${dataValues.length + 1}`));
            dataValues.push(value);
            countClauses.push(sql.replace('?', `$${countValues.length + 1}`));
            countValues.push(value);
        };
        if (doctorId !== null)
            addFilter(`p.id IN (SELECT DISTINCT patient_id FROM appointments WHERE doctor_id = ?)`, doctorId);
        if (first_name)
            addFilter(`p.first_name ILIKE ?`, `%${first_name}%`);
        if (last_name)
            addFilter(`p.last_name ILIKE ?`, `%${last_name}%`);
        if (gender)
            addFilter(`p.gender = ?`, gender);
        if (blood_type)
            addFilter(`p.blood_type ILIKE ?`, `%${blood_type}%`);
        if (phone)
            addFilter(`p.phone ILIKE ?`, `%${phone}%`);
        if (email)
            addFilter(`p.email ILIKE ?`, `%${email}%`);
        if (patient_code)
            addFilter(`p.patient_code ILIKE ?`, `%${patient_code}%`);
        if (date_of_birth)
            addFilter(`p.date_of_birth = ?`, date_of_birth);
        const where = dataClauses.length ? `WHERE ${dataClauses.join(' AND ')}` : '';
        const countWhere = countClauses.length ? `WHERE ${countClauses.join(' AND ')}` : '';
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT p.*, CONCAT(p.first_name,' ',p.last_name) AS full_name,
                DATE_PART('year', AGE(p.date_of_birth))::INT AS age
         FROM patients p ${where}
         ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`, dataValues),
            (0, database_1.query)(`SELECT COUNT(*) FROM patients p ${countWhere}`, countValues),
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
                'policy_number',ui.policy_number,'is_primary',ui.is_primary
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
// GET /patients/:id/medical-history
const getPatientMedicalHistory = async (req, res, next) => {
    try {
        const patientId = req.params.id;
        // 1. Patient demographics
        const patientRes = await (0, database_1.query)(`SELECT p.id, p.patient_code, p.first_name, p.last_name,
              p.gender, p.date_of_birth,
              DATE_PART('year', AGE(p.date_of_birth))::INT AS age,
              p.blood_type, p.phone, p.email, p.address,
              p.emergency_contact_name, p.emergency_contact_phone,
              p.marital_status, p.occupation, p.nationality, p.status
       FROM patients p WHERE p.id = $1`, [patientId]);
        if (patientRes.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Patient not found' });
            return;
        }
        // 2. Insurance
        const [insuranceRes, encountersRes, diagnosesRes, vitalsRes, prescriptionsRes, labOrdersRes, radiologyOrdersRes,] = await Promise.all([
            // Insurance
            (0, database_1.query)(`SELECT ui.*, ip.name AS provider_name, ip.contact_phone AS provider_phone
         FROM user_insurances ui
         JOIN insurance_providers ip ON ip.id = ui.insurance_provider_id
         WHERE ui.patient_id = $1
         ORDER BY ui.is_primary DESC, ui.valid_from DESC`, [patientId]),
            // Encounters (full SOAP)
            (0, database_1.query)(`SELECT e.*,
                COALESCE(d.first_name || ' ' || d.last_name,
                         u.first_name || ' ' || u.last_name) AS doctor_name,
                d.specialization AS doctor_specialization,
                dept.name AS department_name
         FROM encounters e
         JOIN doctors d ON d.id = e.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         LEFT JOIN departments dept ON dept.id = (
             SELECT department_id FROM appointments WHERE id = e.appointment_id LIMIT 1
         )
         WHERE e.patient_id = $1
         ORDER BY e.encounter_date DESC`, [patientId]),
            // Diagnoses
            (0, database_1.query)(`SELECT diag.*,
                COALESCE(d.first_name || ' ' || d.last_name,
                         u.first_name || ' ' || u.last_name) AS doctor_name
         FROM diagnoses diag
         JOIN doctors d ON d.id = diag.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         WHERE diag.patient_id = $1
         ORDER BY diag.diagnosed_date DESC`, [patientId]),
            // Vitals (all recorded)
            (0, database_1.query)(`SELECT v.*,
                CONCAT(u.first_name, ' ', u.last_name) AS recorded_by_name
         FROM vitals v
         LEFT JOIN users u ON u.id = v.recorded_by
         WHERE v.patient_id = $1
         ORDER BY v.recorded_at DESC`, [patientId]),
            // Prescriptions with items
            (0, database_1.query)(`SELECT p.*,
                COALESCE(d.first_name || ' ' || d.last_name,
                         u.first_name || ' ' || u.last_name) AS doctor_name,
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id',              pi.id,
                    'medication_name', pi.medication_name,
                    'dosage',          pi.dosage,
                    'frequency',       pi.frequency,
                    'duration',        pi.duration,
                    'quantity',        pi.quantity,
                    'route',           pi.route,
                    'instructions',    pi.instructions,
                    'is_dispensed',    pi.is_dispensed
                  ) ORDER BY pi.id
                ) AS items
         FROM prescriptions p
         JOIN doctors d ON d.id = p.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
         WHERE p.patient_id = $1
         GROUP BY p.id, d.first_name, d.last_name, u.first_name, u.last_name
         ORDER BY p.prescription_date DESC`, [patientId]),
            // Lab orders with test results
            (0, database_1.query)(`SELECT lo.*,
                COALESCE(d.first_name || ' ' || d.last_name,
                         u.first_name || ' ' || u.last_name) AS doctor_name,
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id',             loi.id,
                    'test_name',      ltc.name,
                    'test_code',      ltc.code,
                    'category',       ltc.category,
                    'status',         loi.status,
                    'result_value',   loi.result_value,
                    'unit',           loi.unit,
                    'normal_range',   loi.normal_range,
                    'interpretation', loi.interpretation,
                    'result_notes',   loi.result_notes,
                    'result_date',    loi.result_date
                  ) ORDER BY loi.id
                ) AS results
         FROM lab_orders lo
         JOIN doctors d ON d.id = lo.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         LEFT JOIN lab_order_items loi ON loi.lab_order_id = lo.id
         LEFT JOIN lab_test_catalog ltc ON ltc.id = loi.lab_test_id
         WHERE lo.patient_id = $1
         GROUP BY lo.id, d.first_name, d.last_name, u.first_name, u.last_name
         ORDER BY lo.order_date DESC`, [patientId]),
            // Radiology orders with findings
            (0, database_1.query)(`SELECT ro.*,
                COALESCE(d.first_name || ' ' || d.last_name,
                         u.first_name || ' ' || u.last_name) AS doctor_name,
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id',               roi.id,
                    'test_name',        rtc.name,
                    'modality',         rtc.modality,
                    'status',           roi.status,
                    'findings',         roi.findings,
                    'impression',       roi.impression,
                    'recommendation',   roi.recommendation,
                    'image_url',        roi.image_url,
                    'report_date',      roi.report_date
                  ) ORDER BY roi.id
                ) AS results
         FROM radiology_orders ro
         JOIN doctors d ON d.id = ro.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         LEFT JOIN radiology_order_items roi ON roi.radiology_order_id = ro.id
         LEFT JOIN radiology_test_catalog rtc ON rtc.id = roi.radiology_test_id
         WHERE ro.patient_id = $1
         GROUP BY ro.id, d.first_name, d.last_name, u.first_name, u.last_name
         ORDER BY ro.order_date DESC`, [patientId]),
        ]);
        // Attach clinical notes to each encounter
        const encounterIds = encountersRes.rows.map((e) => e.id);
        let clinicalNotesMap = {};
        if (encounterIds.length > 0) {
            const notesRes = await (0, database_1.query)(`SELECT cn.*,
                CONCAT(u.first_name, ' ', u.last_name) AS doctor_name
         FROM clinical_notes cn
         JOIN users u ON u.id = cn.doctor_id
         WHERE cn.encounter_id = ANY($1::int[])
         ORDER BY cn.created_at ASC`, [encounterIds]);
            for (const note of notesRes.rows) {
                if (!clinicalNotesMap[note.encounter_id])
                    clinicalNotesMap[note.encounter_id] = [];
                clinicalNotesMap[note.encounter_id].push(note);
            }
        }
        const encounters = encountersRes.rows.map((e) => ({
            ...e,
            clinical_notes: clinicalNotesMap[e.id] ?? [],
        }));
        res.json({
            success: true,
            data: {
                patient: patientRes.rows[0],
                insurance: insuranceRes.rows,
                encounters,
                diagnoses: diagnosesRes.rows,
                vitals: vitalsRes.rows,
                prescriptions: prescriptionsRes.rows,
                lab_orders: labOrdersRes.rows,
                radiology_orders: radiologyOrdersRes.rows,
            },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getPatientMedicalHistory = getPatientMedicalHistory;
// ─── API 1 ──────────────────────────────────────────────────────────────────
// GET /patients/:id/encounters?page=&limit=
// Paginated encounter list with patient header + insurance at the top
const getPatientEncounters = async (req, res, next) => {
    try {
        const patientId = req.params.id;
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
        const offset = (page - 1) * limit;
        const [patientRes, insuranceRes] = await Promise.all([
            (0, database_1.query)(`SELECT p.id, p.patient_code, p.first_name, p.last_name,
                p.gender, p.date_of_birth,
                DATE_PART('year', AGE(p.date_of_birth))::INT AS age,
                p.blood_type, p.phone, p.email, p.address,
                p.emergency_contact_name, p.emergency_contact_phone,
                p.marital_status, p.occupation, p.nationality, p.status
         FROM patients p WHERE p.id = $1`, [patientId]),
            (0, database_1.query)(`SELECT ui.*, ip.name AS provider_name, ip.contact_phone AS provider_phone
         FROM user_insurances ui
         JOIN insurance_providers ip ON ip.id = ui.insurance_provider_id
         WHERE ui.patient_id = $1
         ORDER BY ui.is_primary DESC, ui.valid_from DESC`, [patientId]),
        ]);
        if (patientRes.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Patient not found' });
            return;
        }
        const [encountersRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT e.*,
                CONCAT(u.first_name,' ',u.last_name) AS doctor_name,
                d.specialization AS doctor_specialization,
                dept.name AS department_name
         FROM encounters e
         JOIN doctors d ON d.id = e.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         LEFT JOIN departments dept ON dept.id = (
             SELECT department_id FROM appointments WHERE id = e.appointment_id LIMIT 1
         )
         WHERE e.patient_id = $1
         ORDER BY e.encounter_date DESC
         LIMIT $2 OFFSET $3`, [patientId, limit, offset]),
            (0, database_1.query)(`SELECT COUNT(*) FROM encounters WHERE patient_id = $1`, [patientId]),
        ]);
        // Attach clinical notes to each encounter
        const encounterIds = encountersRes.rows.map((e) => e.id);
        const clinicalNotesMap = {};
        if (encounterIds.length > 0) {
            const notesRes = await (0, database_1.query)(`SELECT cn.*, CONCAT(u.first_name,' ',u.last_name) AS author_name
         FROM clinical_notes cn
         JOIN users u ON u.id = cn.doctor_id
         WHERE cn.encounter_id = ANY($1::int[])
         ORDER BY cn.created_at ASC`, [encounterIds]);
            for (const note of notesRes.rows) {
                if (!clinicalNotesMap[note.encounter_id])
                    clinicalNotesMap[note.encounter_id] = [];
                clinicalNotesMap[note.encounter_id].push(note);
            }
        }
        const encounters = encountersRes.rows.map((e) => ({
            ...e,
            clinical_notes: clinicalNotesMap[e.id] ?? [],
        }));
        const total = parseInt(countRes.rows[0].count, 10);
        res.json({
            success: true,
            data: {
                patient: patientRes.rows[0],
                insurance: insuranceRes.rows,
                encounters,
            },
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getPatientEncounters = getPatientEncounters;
// ─── API 2 ──────────────────────────────────────────────────────────────────
// GET /patients/:id/lab-orders?page=&limit=&status=
const getPatientLabOrders = async (req, res, next) => {
    try {
        const patientId = req.params.id;
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
        const status = req.query.status;
        const offset = (page - 1) * limit;
        const params = [limit, offset, patientId];
        const countParams = [patientId];
        let statusClause = '';
        let countStatusClause = '';
        if (status) {
            statusClause = `AND lo.status = $${params.length + 1}`;
            countStatusClause = `AND lo.status = $${countParams.length + 1}`;
            params.push(status);
            countParams.push(status);
        }
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT lo.id, lo.encounter_id, lo.order_date, lo.priority, lo.status, lo.clinical_notes,
                CONCAT(u.first_name,' ',u.last_name) AS doctor_name,
                d.specialization AS doctor_specialization,
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id',             loi.id,
                    'test_name',      ltc.name,
                    'test_code',      ltc.code,
                    'category',       ltc.category,
                    'status',         loi.status,
                    'result_value',   loi.result_value,
                    'unit',           loi.unit,
                    'normal_range',   loi.normal_range,
                    'interpretation', loi.interpretation,
                    'result_date',    loi.result_date
                  ) ORDER BY loi.id
                ) FILTER (WHERE loi.id IS NOT NULL) AS tests
         FROM lab_orders lo
         JOIN doctors d ON d.id = lo.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         LEFT JOIN lab_order_items loi ON loi.lab_order_id = lo.id
         LEFT JOIN lab_test_catalog ltc ON ltc.id = loi.lab_test_id
         WHERE lo.patient_id = $3 ${statusClause}
         GROUP BY lo.id, u.first_name, u.last_name, d.specialization
         ORDER BY lo.order_date DESC
         LIMIT $1 OFFSET $2`, params),
            (0, database_1.query)(`SELECT COUNT(*) FROM lab_orders lo WHERE lo.patient_id = $1 ${countStatusClause}`, countParams),
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
exports.getPatientLabOrders = getPatientLabOrders;
// ─── API 3 ──────────────────────────────────────────────────────────────────
// GET /patients/:id/radiology-orders?page=&limit=&status=
const getPatientRadiologyOrders = async (req, res, next) => {
    try {
        const patientId = req.params.id;
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
        const status = req.query.status;
        const offset = (page - 1) * limit;
        const params = [limit, offset, patientId];
        const countParams = [patientId];
        let statusClause = '';
        let countStatusClause = '';
        if (status) {
            statusClause = `AND ro.status = $${params.length + 1}`;
            countStatusClause = `AND ro.status = $${countParams.length + 1}`;
            params.push(status);
            countParams.push(status);
        }
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT ro.id, ro.encounter_id, ro.order_date, ro.priority, ro.status, ro.clinical_notes,
                CONCAT(u.first_name,' ',u.last_name) AS doctor_name,
                d.specialization AS doctor_specialization,
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id',             roi.id,
                    'test_name',      rtc.name,
                    'modality',       rtc.modality,
                    'status',         roi.status,
                    'findings',       roi.findings,
                    'impression',     roi.impression,
                    'recommendation', roi.recommendation,
                    'image_url',      roi.image_url,
                    'report_date',    roi.report_date
                  ) ORDER BY roi.id
                ) FILTER (WHERE roi.id IS NOT NULL) AS scans
         FROM radiology_orders ro
         JOIN doctors d ON d.id = ro.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         LEFT JOIN radiology_order_items roi ON roi.radiology_order_id = ro.id
         LEFT JOIN radiology_test_catalog rtc ON rtc.id = roi.radiology_test_id
         WHERE ro.patient_id = $3 ${statusClause}
         GROUP BY ro.id, u.first_name, u.last_name, d.specialization
         ORDER BY ro.order_date DESC
         LIMIT $1 OFFSET $2`, params),
            (0, database_1.query)(`SELECT COUNT(*) FROM radiology_orders ro WHERE ro.patient_id = $1 ${countStatusClause}`, countParams),
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
exports.getPatientRadiologyOrders = getPatientRadiologyOrders;
// ─── API 6 ──────────────────────────────────────────────────────────────────
// GET /patients/:id/prescriptions?page=&limit=
const getPatientPrescriptions = async (req, res, next) => {
    try {
        const patientId = req.params.id;
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
        const offset = (page - 1) * limit;
        const [dataRes, countRes] = await Promise.all([
            (0, database_1.query)(`SELECT p.id, p.encounter_id, p.prescription_date, p.valid_until, p.status, p.notes,
                CONCAT(u.first_name,' ',u.last_name) AS doctor_name,
                d.specialization AS doctor_specialization,
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id',              pi.id,
                    'medication_name', pi.medication_name,
                    'dosage',          pi.dosage,
                    'frequency',       pi.frequency,
                    'duration',        pi.duration,
                    'quantity',        pi.quantity,
                    'route',           pi.route,
                    'instructions',    pi.instructions,
                    'is_dispensed',    pi.is_dispensed
                  ) ORDER BY pi.id
                ) FILTER (WHERE pi.id IS NOT NULL) AS items
         FROM prescriptions p
         JOIN doctors d ON d.id = p.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
         WHERE p.patient_id = $3
         GROUP BY p.id, u.first_name, u.last_name, d.specialization
         ORDER BY p.prescription_date DESC
         LIMIT $1 OFFSET $2`, [limit, offset, patientId]),
            (0, database_1.query)(`SELECT COUNT(*) FROM prescriptions WHERE patient_id = $1`, [patientId]),
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
exports.getPatientPrescriptions = getPatientPrescriptions;
//# sourceMappingURL=patient.controller.js.map