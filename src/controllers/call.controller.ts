import { Response, NextFunction } from 'express';
import https from 'https';
import { query } from '../config/database';
import { env } from '../config/env';
import { AuthRequest } from '../middleware/auth.middleware';

// ── helper: make JSON request to 100ms API ─────────────────────
function hmsRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = https.request(
      {
        hostname: 'api.100ms.live',
        path,
        method,
        headers: {
          Authorization: `Bearer ${env.hmsManagementToken}`,
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => (raw += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(raw) as T);
          } else {
            reject(new Error(`100ms API ${res.statusCode}: ${raw}`));
          }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── POST /calls/room  — create room + get codes ───────────────
export const createCallRoom = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { appointment_id } = req.body;
    if (!appointment_id) {
      res.status(400).json({ success: false, message: 'appointment_id is required' });
      return;
    }

    // 1. Fetch appointment ------------------------------------------------
    const apptResult = await query(
      `SELECT a.id, a.patient_id, a.doctor_id, a.appointment_type, a.reason
       FROM appointments a
       WHERE a.id = $1`,
      [appointment_id],
    );

    if (apptResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Appointment not found' });
      return;
    }

    const appt = apptResult.rows[0];

    // 1b. If room already exists for this appointment, return it ----------
    const existing = await query(
      `SELECT * FROM video_call_rooms WHERE appointment_id = $1`,
      [appointment_id],
    );
    if (existing.rows.length > 0) {
      res.json({ success: true, data: existing.rows[0] });
      return;
    }

    // 2. Create 100ms room ------------------------------------------------
    const roomName = `${appt.id}-${appt.doctor_id}-${appt.patient_id}`;
    const description = `${appt.appointment_type || 'Consultation'}${appt.reason ? ' - ' + appt.reason : ''}`;

    const roomRes = await hmsRequest<{ id: string }>('POST', '/v2/rooms', {
      name: roomName,
      description,
      template_id: env.hmsTemplateId,
    });

    const roomId = roomRes.id;

    // 3. Generate room codes ----------------------------------------------
    const codesRes = await hmsRequest<{ data: { code: string; role: string }[] }>(
      'POST',
      `/v2/room-codes/room/${roomId}`,
    );

    let patientRoomCode = '';
    let doctorRoomCode = '';
    for (const entry of codesRes.data) {
      if (entry.role === 'patient') patientRoomCode = entry.code;
      if (entry.role === 'doctor') doctorRoomCode = entry.code;
    }

    // 4. Persist to DB ----------------------------------------------------
    const insertResult = await query(
      `INSERT INTO video_call_rooms
         (appointment_id, patient_id, doctor_id, room_id, patient_room_code, doctor_room_code)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [appointment_id, appt.patient_id, appt.doctor_id, roomId, patientRoomCode, doctorRoomCode],
    );

    res.status(201).json({ success: true, data: insertResult.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ── GET /calls/room/:appointment_id  — fetch existing room ────
export const getCallRoom = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { appointment_id } = req.params;

    const result = await query(
      `SELECT * FROM video_call_rooms WHERE appointment_id = $1`,
      [appointment_id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'No call room found for this appointment' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};
