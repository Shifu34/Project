"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAiSummaries = exports.getAiSummaryById = exports.getCallSummary = exports.createCallSummary = exports.createAiSummary = void 0;
const database_1 = require("../config/database");
// ─────────────────────────────────────────────────────────────────────────────
// POST /ai-summaries
// Body: { summary_type, content, patient_id, appointment_id?, encounter_id?,
//         report_id?, lab_order_id?, radiology_order_id?, prescription_id?,
//         doctor_id?, ai_model?, language? }
// ─────────────────────────────────────────────────────────────────────────────
const createAiSummary = async (req, res, next) => {
    try {
        const { summary_type, content, patient_id, appointment_id = null, encounter_id = null, report_id = null, lab_order_id = null, radiology_order_id = null, prescription_id = null, doctor_id = null, ai_model = null, language = 'en', structured_data = null, } = req.body;
        const result = await (0, database_1.query)(`INSERT INTO ai_summaries
         (summary_type, content, structured_data, patient_id, appointment_id, encounter_id,
          report_id, lab_order_id, radiology_order_id, prescription_id,
          doctor_id, ai_model, language, generated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`, [
            summary_type, content,
            structured_data ? JSON.stringify(structured_data) : null,
            patient_id, appointment_id, encounter_id,
            report_id, lab_order_id, radiology_order_id, prescription_id,
            doctor_id, ai_model, language, req.user?.userId ?? null,
        ]);
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.createAiSummary = createAiSummary;
// ─────────────────────────────────────────────────────────────────────────────
// POST /ai-summaries/call-summary
// Convenience wrapper: saves a post-call summary (summary_type='call') visible
// to both doctor and patient. Links to appointment (and optionally encounter).
// Body: { appointment_id, patient_id, doctor_id?, content, structured_data?,
//         encounter_id?, ai_model?, language? }
// ─────────────────────────────────────────────────────────────────────────────
const createCallSummary = async (req, res, next) => {
    try {
        const { appointment_id, patient_id, doctor_id = null, encounter_id = null, content, structured_data = null, ai_model = null, language = 'en', } = req.body;
        if (!appointment_id || !patient_id || !content) {
            res.status(400).json({ success: false, message: 'appointment_id, patient_id and content are required' });
            return;
        }
        const result = await (0, database_1.query)(`INSERT INTO ai_summaries
         (summary_type, content, structured_data, patient_id, appointment_id,
          encounter_id, doctor_id, ai_model, language, generated_by)
       VALUES ('call',$1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`, [
            content,
            structured_data ? JSON.stringify(structured_data) : null,
            patient_id, appointment_id, encounter_id, doctor_id,
            ai_model, language, req.user?.userId ?? null,
        ]);
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.createCallSummary = createCallSummary;
// ─────────────────────────────────────────────────────────────────────────────
// GET /ai-summaries/call-summary?appointment_id=
// Returns the post-call summary for an appointment (visible to doctor + patient)
// ─────────────────────────────────────────────────────────────────────────────
const getCallSummary = async (req, res, next) => {
    try {
        const { appointment_id } = req.query;
        if (!appointment_id) {
            res.status(400).json({ success: false, message: 'appointment_id query param is required' });
            return;
        }
        const result = await (0, database_1.query)(`SELECT s.*,
              CONCAT(u.first_name,' ',u.last_name) AS generated_by_name,
              p.first_name || ' ' || p.last_name   AS patient_name,
              d.first_name || ' ' || d.last_name   AS doctor_name
       FROM ai_summaries s
       LEFT JOIN users    u ON u.id = s.generated_by
       LEFT JOIN patients p ON p.id = s.patient_id
       LEFT JOIN doctors  d ON d.id = s.doctor_id
       WHERE s.appointment_id = $1
         AND s.summary_type   = 'call'
       ORDER BY s.created_at DESC`, [appointment_id]);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        next(err);
    }
};
exports.getCallSummary = getCallSummary;
// ─────────────────────────────────────────────────────────────────────────────
// GET /ai-summaries/:id
// ─────────────────────────────────────────────────────────────────────────────
const getAiSummaryById = async (req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT s.*,
              CONCAT(u.first_name,' ',u.last_name) AS generated_by_name
       FROM ai_summaries s
       LEFT JOIN users u ON u.id = s.generated_by
       WHERE s.id = $1`, [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Summary not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.getAiSummaryById = getAiSummaryById;
// ─────────────────────────────────────────────────────────────────────────────
// GET /ai-summaries
// Query: patient_id, summary_type, appointment_id, encounter_id,
//        report_id, lab_order_id, radiology_order_id, prescription_id,
//        page, limit
// ─────────────────────────────────────────────────────────────────────────────
const getAiSummaries = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
        const offset = (page - 1) * limit;
        const filterVals = [];
        const conditions = [];
        const qs = req.query;
        for (const col of ['patient_id', 'summary_type', 'appointment_id', 'encounter_id', 'report_id', 'lab_order_id', 'radiology_order_id', 'prescription_id']) {
            if (qs[col]) {
                filterVals.push(qs[col]);
                conditions.push(`s.${col} = $${filterVals.length}`);
            }
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        // Count query uses $1..$n for filter values
        const countRes = await (0, database_1.query)(`SELECT COUNT(*) FROM ai_summaries s ${where}`, filterVals);
        // Data query appends limit/offset AFTER filter values
        const limitIdx = filterVals.length + 1;
        const offsetIdx = filterVals.length + 2;
        const dataRes = await (0, database_1.query)(`SELECT s.id, s.summary_type, s.patient_id, s.appointment_id,
              s.encounter_id, s.report_id, s.lab_order_id,
              s.radiology_order_id, s.prescription_id, s.doctor_id,
              s.ai_model, s.language, s.created_at, s.structured_data,
              s.content,
              CONCAT(u.first_name,' ',u.last_name) AS generated_by_name
       FROM ai_summaries s
       LEFT JOIN users u ON u.id = s.generated_by
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`, [...filterVals, limit, offset]);
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
exports.getAiSummaries = getAiSummaries;
//# sourceMappingURL=ai-summary.controller.js.map