import { Response, NextFunction } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// ─────────────────────────────────────────────────────────────────────────────
// POST /calls/notes
// Body: { appointment_id, room_id?, patient_id, doctor_id?, note_type?,
//         content?, structured_data?, ai_model?, language? }
// Visibility: doctor-only (enforced at route level)
// ─────────────────────────────────────────────────────────────────────────────
export const createCallNote = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      appointment_id,
      room_id          = null,
      patient_id,
      doctor_id        = null,
      note_type        = 'realtime',
      content          = null,
      structured_data  = null,
      ai_model         = null,
      language         = 'en',
    } = req.body;

    const result = await query(
      `INSERT INTO call_ai_notes
         (appointment_id, room_id, patient_id, doctor_id, note_type,
          content, structured_data, ai_model, language, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        appointment_id, room_id, patient_id, doctor_id, note_type,
        content,
        structured_data ? JSON.stringify(structured_data) : null,
        ai_model, language, req.user?.userId ?? null,
      ],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /calls/notes/:id
// ─────────────────────────────────────────────────────────────────────────────
export const getCallNoteById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT n.*,
              p.first_name || ' ' || p.last_name AS patient_name,
              d.first_name || ' ' || d.last_name AS doctor_name
       FROM call_ai_notes n
       LEFT JOIN patients p ON p.id = n.patient_id
       LEFT JOIN doctors  d ON d.id = n.doctor_id
       WHERE n.id = $1`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Call note not found' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /calls/notes?appointment_id=&room_id=&note_type=&page=&limit=
// Doctor-only (enforced at route level)
// ─────────────────────────────────────────────────────────────────────────────
export const getCallNotes = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page  = Math.max(1,   parseInt(req.query.page  as string || '1',  10));
    const limit = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (req.query.appointment_id) { conditions.push(`n.appointment_id = $${idx++}`); values.push(req.query.appointment_id); }
    if (req.query.room_id)        { conditions.push(`n.room_id = $${idx++}`);        values.push(req.query.room_id); }
    if (req.query.note_type)      { conditions.push(`n.note_type = $${idx++}`);      values.push(req.query.note_type); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countRes] = await Promise.all([
      query(
        `SELECT n.*,
                p.first_name || ' ' || p.last_name AS patient_name,
                d.first_name || ' ' || d.last_name AS doctor_name
         FROM call_ai_notes n
         LEFT JOIN patients p ON p.id = n.patient_id
         LEFT JOIN doctors  d ON d.id = n.doctor_id
         ${where}
         ORDER BY n.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset],
      ),
      query(
        `SELECT COUNT(*) FROM call_ai_notes n ${where}`,
        values,
      ),
    ]);

    res.json({
      success: true,
      data: rows.rows,
      pagination: {
        total: parseInt(countRes.rows[0].count, 10),
        page,
        limit,
        pages: Math.ceil(parseInt(countRes.rows[0].count, 10) / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};
