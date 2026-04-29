import { Response, NextFunction } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// ─────────────────────────────────────────────────────────────────────────────
// POST /call-transcriptions
// Body: { appointment_id?, room_name?, transcription, language?,
//         duration_seconds?, started_at?, ended_at? }
// ─────────────────────────────────────────────────────────────────────────────
export const createCallTranscription = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      appointment_id   = null,
      room_name        = null,
      transcription,
      language         = 'en',
      duration_seconds = null,
      started_at       = null,
      ended_at         = null,
    } = req.body;

    const result = await query(
      `INSERT INTO call_transcriptions
         (appointment_id, room_name, transcription, language,
          duration_seconds, started_at, ended_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        appointment_id, room_name, transcription, language,
        duration_seconds, started_at, ended_at, req.user?.userId ?? null,
      ],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /call-transcriptions/:id
// ─────────────────────────────────────────────────────────────────────────────
export const getCallTranscriptionById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT ct.*,
              a.appointment_date,
              a.appointment_type,
              CONCAT(pu.first_name,' ',pu.last_name) AS patient_name,
              p.patient_code,
              CONCAT(du.first_name,' ',du.last_name) AS doctor_name,
              d.specialization                         AS doctor_specialization
       FROM call_transcriptions ct
       LEFT JOIN appointments a   ON a.id = ct.appointment_id
       LEFT JOIN patients p       ON p.id = a.patient_id
       LEFT JOIN users pu         ON pu.id = p.user_id
       LEFT JOIN doctors d        ON d.id = a.doctor_id
       LEFT JOIN users du         ON du.id = d.user_id
       WHERE ct.id = $1`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Transcription not found' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /call-transcriptions?appointment_id=&room_name=&page=&limit=
// ─────────────────────────────────────────────────────────────────────────────
export const getCallTranscriptions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page   = Math.max(1,   parseInt(req.query.page  as string || '1',  10));
    const limit  = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const offset = (page - 1) * limit;

    const filters: { col: string; val: unknown }[] = [];

    const qs = req.query as Record<string, string>;
    if (qs.appointment_id) filters.push({ col: 'ct.appointment_id', val: qs.appointment_id });
    if (qs.room_name)      filters.push({ col: 'ct.room_name',      val: qs.room_name });

    const where = filters.length
      ? 'WHERE ' + filters.map((f, i) => `${f.col} = $${i + 3}`).join(' AND ')
      : '';

    const params = [limit, offset, ...filters.map(f => f.val)];
    const countParams = filters.map(f => f.val);

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT ct.id, ct.appointment_id, ct.room_name, ct.language,
                ct.duration_seconds, ct.started_at, ct.ended_at, ct.created_at,
                LEFT(ct.transcription, 200) AS transcription_preview,
                CONCAT(pu.first_name,' ',pu.last_name) AS patient_name,
                CONCAT(du.first_name,' ',du.last_name) AS doctor_name
         FROM call_transcriptions ct
         LEFT JOIN appointments a ON a.id = ct.appointment_id
         LEFT JOIN patients p     ON p.id = a.patient_id
         LEFT JOIN users pu       ON pu.id = p.user_id
         LEFT JOIN doctors d      ON d.id = a.doctor_id
         LEFT JOIN users du       ON du.id = d.user_id
         ${where}
         ORDER BY ct.created_at DESC
         LIMIT $1 OFFSET $2`,
        params,
      ),
      query(
        `SELECT COUNT(*) FROM call_transcriptions ct ${where}`,
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
