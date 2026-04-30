import { Response, NextFunction } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// ─────────────────────────────────────────────────────────────────────────────
// POST /ai-summaries
// Body: { summary_type, content, patient_id, appointment_id?, encounter_id?,
//         report_id?, lab_order_id?, radiology_order_id?, prescription_id?,
//         doctor_id?, ai_model?, language? }
// ─────────────────────────────────────────────────────────────────────────────
export const createAiSummary = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      summary_type,
      content,
      patient_id,
      appointment_id      = null,
      encounter_id        = null,
      report_id           = null,
      lab_order_id        = null,
      radiology_order_id  = null,
      prescription_id     = null,
      doctor_id           = null,
      ai_model            = null,
      language            = 'en',
      structured_data     = null,
    } = req.body;

    const result = await query(
      `INSERT INTO ai_summaries
         (summary_type, content, structured_data, patient_id, appointment_id, encounter_id,
          report_id, lab_order_id, radiology_order_id, prescription_id,
          doctor_id, ai_model, language, generated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        summary_type, content,
        structured_data ? JSON.stringify(structured_data) : null,
        patient_id, appointment_id, encounter_id,
        report_id, lab_order_id, radiology_order_id, prescription_id,
        doctor_id, ai_model, language, req.user?.userId ?? null,
      ],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /ai-summaries/call-summary
// Convenience wrapper: saves a post-call summary (summary_type='call') visible
// to both doctor and patient. Links to appointment (and optionally encounter).
// Body: { appointment_id, patient_id, doctor_id?, content, structured_data?,
//         encounter_id?, ai_model?, language? }
// ─────────────────────────────────────────────────────────────────────────────
export const createCallSummary = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      appointment_id,
      patient_id,
      doctor_id       = null,
      encounter_id    = null,
      content,
      structured_data = null,
      ai_model        = null,
      language        = 'en',
    } = req.body;

    if (!appointment_id || !patient_id || !content) {
      res.status(400).json({ success: false, message: 'appointment_id, patient_id and content are required' });
      return;
    }

    const result = await query(
      `INSERT INTO ai_summaries
         (summary_type, content, structured_data, patient_id, appointment_id,
          encounter_id, doctor_id, ai_model, language, generated_by)
       VALUES ('call',$1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        content,
        structured_data ? JSON.stringify(structured_data) : null,
        patient_id, appointment_id, encounter_id, doctor_id,
        ai_model, language, req.user?.userId ?? null,
      ],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /ai-summaries/call-summary?appointment_id=
// Returns the post-call summary for an appointment (visible to doctor + patient)
// ─────────────────────────────────────────────────────────────────────────────
export const getCallSummary = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { appointment_id } = req.query;

    if (!appointment_id) {
      res.status(400).json({ success: false, message: 'appointment_id query param is required' });
      return;
    }

    const result = await query(
      `SELECT s.*,
              CONCAT(u.first_name,' ',u.last_name) AS generated_by_name,
              p.first_name || ' ' || p.last_name   AS patient_name,
              d.first_name || ' ' || d.last_name   AS doctor_name
       FROM ai_summaries s
       LEFT JOIN users    u ON u.id = s.generated_by
       LEFT JOIN patients p ON p.id = s.patient_id
       LEFT JOIN doctors  d ON d.id = s.doctor_id
       WHERE s.appointment_id = $1
         AND s.summary_type   = 'call'
       ORDER BY s.created_at DESC`,
      [appointment_id],
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /ai-summaries/:id
// ─────────────────────────────────────────────────────────────────────────────
export const getAiSummaryById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT s.*,
              CONCAT(u.first_name,' ',u.last_name) AS generated_by_name
       FROM ai_summaries s
       LEFT JOIN users u ON u.id = s.generated_by
       WHERE s.id = $1`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Summary not found' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /ai-summaries
// Query: patient_id, summary_type, appointment_id, encounter_id,
//        report_id, lab_order_id, radiology_order_id, prescription_id,
//        page, limit
// ─────────────────────────────────────────────────────────────────────────────
export const getAiSummaries = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page   = Math.max(1,   parseInt(req.query.page  as string || '1',  10));
    const limit  = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const offset = (page - 1) * limit;

    const filters: { col: string; val: unknown }[] = [];

    const qs = req.query as Record<string, string>;
    for (const col of ['patient_id', 'summary_type', 'appointment_id', 'encounter_id', 'report_id', 'lab_order_id', 'radiology_order_id', 'prescription_id']) {
      if (qs[col]) filters.push({ col: `s.${col}`, val: qs[col] });
    }

    const where = filters.length
      ? 'WHERE ' + filters.map((f, i) => `${f.col} = $${i + 3}`).join(' AND ')
      : '';

    const params = [limit, offset, ...filters.map(f => f.val)];
    const countParams = filters.map(f => f.val);

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT s.id, s.summary_type, s.patient_id, s.appointment_id,
                s.encounter_id, s.report_id, s.lab_order_id,
                s.radiology_order_id, s.prescription_id, s.doctor_id,
                s.ai_model, s.language, s.created_at,
                LEFT(s.content, 200) AS content_preview,
                CONCAT(u.first_name,' ',u.last_name) AS generated_by_name
         FROM ai_summaries s
         LEFT JOIN users u ON u.id = s.generated_by
         ${where}
         ORDER BY s.created_at DESC
         LIMIT $1 OFFSET $2`,
        params,
      ),
      query(
        `SELECT COUNT(*) FROM ai_summaries s ${where}`,
        countParams,
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    res.json({
      success: true,
      data: dataRes.rows,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};
