"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEncounterFull = exports.getEncounterVitals = exports.addClinicalNote = exports.getVisitDiagnoses = exports.addDiagnosis = exports.recordVitalSigns = exports.updateVisit = exports.getVisitById = exports.createVisit = void 0;
const database_1 = require("../config/database");
// POST /encounters  – open a clinical encounter
const createVisit = async (req, res, next) => {
    try {
        const { appointment_id, patient_id, doctor_id, encounter_type, chief_complaint, history_of_present_illness, } = req.body;
        if (appointment_id) {
            await (0, database_1.query)(`UPDATE appointments SET status = 'in_progress' WHERE id = $1`, [appointment_id]);
        }
        const result = await (0, database_1.query)(`INSERT INTO encounters (appointment_id, patient_id, doctor_id, encounter_type,
       chief_complaint, history_of_present_illness)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [appointment_id, patient_id, doctor_id, encounter_type,
            chief_complaint, history_of_present_illness]);
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.createVisit = createVisit;
// GET /encounters/:id
const getVisitById = async (req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT e.*,
              CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code,
              CONCAT(u.first_name,' ',u.last_name) AS doctor_name
       FROM encounters e
       JOIN patients p ON p.id = e.patient_id
       JOIN doctors doc ON doc.id = e.doctor_id
       JOIN users u ON u.id = doc.user_id
       WHERE e.id = $1`, [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Encounter not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.getVisitById = getVisitById;
// PUT /encounters/:id  – update clinical notes / complete encounter
const updateVisit = async (req, res, next) => {
    try {
        const { chief_complaint, history_of_present_illness, physical_examination, assessment, plan, follow_up_date, status, } = req.body;
        const result = await (0, database_1.query)(`UPDATE encounters
       SET chief_complaint=$1, history_of_present_illness=$2, physical_examination=$3,
           assessment=$4, plan=$5, follow_up_date=$6, status=$7
       WHERE id = $8 RETURNING *`, [chief_complaint, history_of_present_illness, physical_examination,
            assessment, plan, follow_up_date, status, req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Encounter not found' });
            return;
        }
        if (status === 'completed') {
            await (0, database_1.query)(`UPDATE appointments SET status = 'completed'
         WHERE id = (SELECT appointment_id FROM encounters WHERE id = $1) AND appointment_id IS NOT NULL`, [req.params.id]);
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.updateVisit = updateVisit;
// POST /encounters/:id/vitals
const recordVitalSigns = async (req, res, next) => {
    try {
        const { patient_id, temperature, blood_pressure_systolic, blood_pressure_diastolic, heart_rate, respiratory_rate, oxygen_saturation, weight, height, bmi, blood_glucose, pain_scale, notes, } = req.body;
        const recordedBy = req.user?.userId;
        const result = await (0, database_1.query)(`INSERT INTO vitals
         (encounter_id, patient_id, recorded_by, temperature, blood_pressure_systolic,
          blood_pressure_diastolic, heart_rate, respiratory_rate, oxygen_saturation,
          weight, height, bmi, blood_glucose, pain_scale, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`, [req.params.id, patient_id, recordedBy, temperature, blood_pressure_systolic,
            blood_pressure_diastolic, heart_rate, respiratory_rate, oxygen_saturation,
            weight, height, bmi, blood_glucose, pain_scale, notes]);
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.recordVitalSigns = recordVitalSigns;
// POST /encounters/:id/diagnoses
const addDiagnosis = async (req, res, next) => {
    try {
        const { patient_id, doctor_id, icd_code, diagnosis_text, diagnosis_type, notes } = req.body;
        const result = await (0, database_1.query)(`INSERT INTO diagnoses (encounter_id, patient_id, doctor_id, icd_code, diagnosis_text, diagnosis_type, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [req.params.id, patient_id, doctor_id, icd_code, diagnosis_text, diagnosis_type, notes]);
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.addDiagnosis = addDiagnosis;
// GET /encounters/:id/diagnoses
const getVisitDiagnoses = async (req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT * FROM diagnoses WHERE encounter_id = $1 ORDER BY created_at ASC`, [req.params.id]);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        next(err);
    }
};
exports.getVisitDiagnoses = getVisitDiagnoses;
// POST /encounters/:id/clinical-notes
const addClinicalNote = async (req, res, next) => {
    try {
        const { note_type, content } = req.body;
        const doctorId = req.user?.userId;
        const result = await (0, database_1.query)(`INSERT INTO clinical_notes (encounter_id, doctor_id, note_type, content)
       VALUES ($1,$2,$3,$4) RETURNING *`, [req.params.id, doctorId, note_type, content]);
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.addClinicalNote = addClinicalNote;
// GET /encounters/:id/vitals
const getEncounterVitals = async (req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT * FROM vitals WHERE encounter_id = $1 ORDER BY recorded_at ASC`, [req.params.id]);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        next(err);
    }
};
exports.getEncounterVitals = getEncounterVitals;
// ─── API 5 ──────────────────────────────────────────────────────────────────
// GET /encounters/:id/full  – complete encounter with all related data
const getEncounterFull = async (req, res, next) => {
    try {
        const encounterId = req.params.id;
        const encounterRes = await (0, database_1.query)(`SELECT e.*,
              CONCAT(u.first_name,' ',u.last_name) AS doctor_name,
              d.specialization AS doctor_specialization,
              dept.name AS department_name
       FROM encounters e
       JOIN doctors d ON d.id = e.doctor_id
       LEFT JOIN users u ON u.id = d.user_id
       LEFT JOIN departments dept ON dept.id = (
           SELECT department_id FROM appointments WHERE id = e.appointment_id LIMIT 1
       )
       WHERE e.id = $1`, [encounterId]);
        if (encounterRes.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Encounter not found' });
            return;
        }
        const [clinicalNotesRes, diagnosesRes, vitalsRes, prescriptionsRes, labOrdersRes, radiologyOrdersRes,] = await Promise.all([
            (0, database_1.query)(`SELECT cn.*, CONCAT(u.first_name,' ',u.last_name) AS author_name
         FROM clinical_notes cn
         JOIN users u ON u.id = cn.doctor_id
         WHERE cn.encounter_id = $1
         ORDER BY cn.created_at ASC`, [encounterId]),
            (0, database_1.query)(`SELECT diag.*, CONCAT(u.first_name,' ',u.last_name) AS doctor_name
         FROM diagnoses diag
         JOIN doctors d ON d.id = diag.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         WHERE diag.encounter_id = $1
         ORDER BY diag.diagnosed_date ASC`, [encounterId]),
            (0, database_1.query)(`SELECT v.*, CONCAT(u.first_name,' ',u.last_name) AS recorded_by_name
         FROM vitals v
         LEFT JOIN users u ON u.id = v.recorded_by
         WHERE v.encounter_id = $1
         ORDER BY v.recorded_at ASC`, [encounterId]),
            (0, database_1.query)(`SELECT p.id, p.prescription_date, p.valid_until, p.status, p.notes,
                CONCAT(u.first_name,' ',u.last_name) AS doctor_name,
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
         WHERE p.encounter_id = $1
         GROUP BY p.id, u.first_name, u.last_name`, [encounterId]),
            (0, database_1.query)(`SELECT lo.id, lo.order_date, lo.priority, lo.status, lo.clinical_notes,
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
                ) FILTER (WHERE loi.id IS NOT NULL) AS tests
         FROM lab_orders lo
         LEFT JOIN lab_order_items loi ON loi.lab_order_id = lo.id
         LEFT JOIN lab_test_catalog ltc ON ltc.id = loi.lab_test_id
         WHERE lo.encounter_id = $1
         GROUP BY lo.id`, [encounterId]),
            (0, database_1.query)(`SELECT ro.id, ro.order_date, ro.priority, ro.status, ro.clinical_notes,
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
         LEFT JOIN radiology_order_items roi ON roi.radiology_order_id = ro.id
         LEFT JOIN radiology_test_catalog rtc ON rtc.id = roi.radiology_test_id
         WHERE ro.encounter_id = $1
         GROUP BY ro.id`, [encounterId]),
        ]);
        res.json({
            success: true,
            data: {
                encounter: {
                    ...encounterRes.rows[0],
                    clinical_notes: clinicalNotesRes.rows,
                    diagnoses: diagnosesRes.rows,
                    vitals: vitalsRes.rows,
                    prescriptions: prescriptionsRes.rows,
                    lab_orders: labOrdersRes.rows,
                    radiology_orders: radiologyOrdersRes.rows,
                },
            },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getEncounterFull = getEncounterFull;
//# sourceMappingURL=visit.controller.js.map