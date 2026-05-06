import { Request, Response, NextFunction } from 'express';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// GET /appointments
export const getAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page   = Math.max(1,   parseInt(req.query.page as string || '1',  10));
    const size   = Math.min(100, parseInt((req.query.size || req.query.limit) as string || '20', 10));
    const date   = req.query.date   as string | undefined;
    const status = req.query.status as string | undefined;
    const offset = (page - 1) * size;

    const conditions: string[] = [];
    const params: unknown[] = [size, offset];
    let idx = 3;

    if (date)   { conditions.push(`a.appointment_date = $${idx++}`); params.push(date); }
    if (status) { conditions.push(`a.status = $${idx++}`); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT a.*,
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
         LIMIT $1 OFFSET $2`,
        params,
      ),
      query(`SELECT COUNT(*) FROM appointments a ${where}`, conditions.length ? params.slice(2) : []),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    res.json({ success: true, data: dataRes.rows, pagination: { total, page, size, totalPages: Math.ceil(total / size) } });
  } catch (err) {
    next(err);
  }
};

// GET /appointments/:id
export const getAppointmentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT a.*,
              CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code, p.phone AS patient_phone,
              CONCAT(u.first_name,' ',u.last_name) AS doctor_name, doc.specialization,
              dept.name AS department
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN doctors doc ON doc.id = a.doctor_id
       JOIN users u ON u.id = doc.user_id
       LEFT JOIN departments dept ON dept.id = a.department_id
       WHERE a.id = $1`,
      [req.params.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Appointment not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /appointments
export const createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      patient_id, doctor_id, department_id, appointment_date, appointment_time,
      duration_minutes, appointment_type, nature_of_visit_id, nature_of_visit, reason, notes,
    } = req.body;

    const bookedBy = (req as Request & { user?: { userId: number } }).user?.userId;

    // Resolve nature_of_visit_id: accept either the ID directly or a name string
    let resolvedNatureId: number | null = nature_of_visit_id || null;
    if (!resolvedNatureId && nature_of_visit) {
      const novRes = await query(
        `SELECT id FROM nature_of_visit WHERE name ILIKE $1 LIMIT 1`,
        [nature_of_visit.trim()],
      );
      if (novRes.rows.length > 0) {
        resolvedNatureId = novRes.rows[0].id;
      }
    }

    // Conflict check
    const conflict = await query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1 AND appointment_date = $2 AND appointment_time = $3
         AND status NOT IN ('cancelled','no_show')`,
      [doctor_id, appointment_date, appointment_time],
    );
    if (conflict.rows.length > 0) {
      res.status(409).json({ success: false, message: 'Doctor already has an appointment at this time' });
      return;
    }

    const result = await query(
      `INSERT INTO appointments
         (patient_id, doctor_id, department_id, appointment_date, appointment_time,
          duration_minutes, appointment_type, nature_of_visit_id, reason, notes, booked_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [patient_id, doctor_id, department_id, appointment_date, appointment_time,
       duration_minutes || 30, appointment_type || 'Online Consultation', resolvedNatureId, reason, notes, bookedBy],
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// PATCH /appointments/:id/status
export const updateAppointmentStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, cancellation_reason } = req.body;
    const cancelledBy = (req as Request & { user?: { userId: number } }).user?.userId;

    const result = await query(
      `UPDATE appointments
       SET status = $1,
           cancelled_by = CASE WHEN $1 = 'cancelled' THEN $3::INT ELSE cancelled_by END,
           cancellation_reason = CASE WHEN $1 = 'cancelled' THEN $2 ELSE cancellation_reason END
       WHERE id = $4 RETURNING *`,
      [status, cancellation_reason, cancelledBy, req.params.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Appointment not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// PUT /appointments/:id
export const updateAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      appointment_date, appointment_time, duration_minutes,
      appointment_type, nature_of_visit_id, reason, notes,
    } = req.body;

    const result = await query(
      `UPDATE appointments
       SET appointment_date=$1, appointment_time=$2, duration_minutes=$3,
           appointment_type=$4, nature_of_visit_id=$5, reason=$6, notes=$7
       WHERE id = $8 RETURNING *`,
      [appointment_date, appointment_time, duration_minutes, appointment_type, nature_of_visit_id, reason, notes, req.params.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Appointment not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// GET /appointments/me  — works for both patient and doctor
export const getMyAppointments = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId   = req.user!.userId;
    const roleName = req.user!.roleName;
    const page   = Math.max(1,   parseInt(req.query.page as string || '1',  10));
    const size   = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const status = req.query.status as string | undefined;
    const date   = req.query.date   as string | undefined;
    const offset = (page - 1) * size;

    let ownerCondition: string;
    let ownerParam: unknown;

    if (roleName === 'patient') {
      const patientRes = await query(
        `SELECT id FROM patients WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      if (patientRes.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Patient profile not found' });
        return;
      }
      ownerCondition = 'a.patient_id = $3';
      ownerParam = patientRes.rows[0].id;
    } else if (roleName === 'doctor') {
      const doctorRes = await query(
        `SELECT id FROM doctors WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      if (doctorRes.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Doctor profile not found' });
        return;
      }
      ownerCondition = 'a.doctor_id = $3';
      ownerParam = doctorRes.rows[0].id;
    } else {
      res.status(403).json({ success: false, message: 'Only patients and doctors can use this endpoint' });
      return;
    }

    const dataParams: unknown[] = [size, offset, ownerParam];
    const countParams: unknown[] = [ownerParam];
    const ownerColClause = ownerCondition; // e.g. 'a.patient_id = $3'
    const ownerColClauseCount = ownerCondition.replace('$3', '$1');
    const dataConditions: string[] = [ownerColClause];
    const countConditions: string[] = [ownerColClauseCount];
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

    const where      = `WHERE ${dataConditions.join(' AND ')}`;
    const countWhere = `WHERE ${countConditions.join(' AND ')}`;

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT
           a.id, a.appointment_date, a.appointment_time, a.duration_minutes,
           a.appointment_type, nov.name AS nature_of_visit, a.nature_of_visit_id, a.status, a.reason, a.notes,
           a.cancellation_reason, a.created_at,
           p.id AS patient_id, CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code, p.phone AS patient_phone,
           p.gender AS patient_gender, DATE_PART('year', AGE(p.date_of_birth))::INT AS patient_age,
           doc.id AS doctor_id,
           CONCAT(doc.first_name,' ',doc.last_name) AS doctor_name,
           doc.specialization, doc.consultation_fee,
           dept.name AS department
         FROM appointments a
         JOIN patients p   ON p.id   = a.patient_id
         JOIN doctors doc  ON doc.id = a.doctor_id
         LEFT JOIN departments dept ON dept.id = a.department_id
         LEFT JOIN nature_of_visit nov ON nov.id = a.nature_of_visit_id
         ${where}
         ORDER BY a.appointment_date DESC, a.appointment_time DESC
         LIMIT $1 OFFSET $2`,
        dataParams,
      ),
      query(
        `SELECT COUNT(*) FROM appointments a ${countWhere}`,
        countParams,
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    res.json({
      success: true,
      data: dataRes.rows,
      pagination: { total, page, size, totalPages: Math.ceil(total / size) },
    });
  } catch (err) {
    next(err);
  }
};

// GET /appointments/upcoming?days=7  — next 1 upcoming appointment
export const getUpcomingAppointment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId   = req.user!.userId;
    const roleName = req.user!.roleName;
    const days = Math.max(1, Math.min(365, parseInt(req.query.days as string || '7', 10)));

    // current_time: ISO timestamp from client e.g. "2026-03-25T14:30:00Z"
    // Allows Pakistan clients (UTC+5) to pass their local time converted to UTC
    // Falls back to server UTC if not provided
    let currentDate: string;
    let currentTime: string;
    const tsParam = (req.query.current_time as string || '').trim();
    const tsDate = tsParam ? new Date(tsParam) : null;
    if (tsDate && !isNaN(tsDate.getTime())) {
      currentDate = tsDate.toISOString().split('T')[0];
      currentTime = tsDate.toISOString().split('T')[1].slice(0, 8); // HH:mm:ss
    } else {
      const now = new Date();
      currentDate = now.toISOString().split('T')[0];
      currentTime = now.toISOString().split('T')[1].slice(0, 8);
    }

    let ownerCondition: string;
    let ownerParam: unknown;

    if (roleName === 'patient') {
      const patientRes = await query(`SELECT id FROM patients WHERE user_id = $1 LIMIT 1`, [userId]);
      if (patientRes.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Patient profile not found' });
        return;
      }
      ownerCondition = 'a.patient_id = $1';
      ownerParam = patientRes.rows[0].id;
    } else if (roleName === 'doctor') {
      const doctorRes = await query(`SELECT id FROM doctors WHERE user_id = $1 LIMIT 1`, [userId]);
      if (doctorRes.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Doctor profile not found' });
        return;
      }
      ownerCondition = 'a.doctor_id = $1';
      ownerParam = doctorRes.rows[0].id;
    } else {
      res.status(403).json({ success: false, message: 'Only patients and doctors can use this endpoint' });
      return;
    }

    const result = await query(
      `SELECT
         a.id, a.appointment_date, a.appointment_time, a.duration_minutes,
         a.appointment_type, nov.name AS nature_of_visit, a.nature_of_visit_id, a.status, a.reason, a.notes,
         a.created_at,
         p.id AS patient_id, CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code,
         p.gender AS patient_gender, DATE_PART('year', AGE(p.date_of_birth))::INT AS patient_age,
         doc.id AS doctor_id,
         CONCAT(doc.first_name,' ',doc.last_name) AS doctor_name,
         doc.specialization, doc.consultation_fee,
         dept.name AS department
       FROM appointments a
       JOIN patients p   ON p.id   = a.patient_id
       JOIN doctors doc  ON doc.id = a.doctor_id
       LEFT JOIN departments dept ON dept.id = a.department_id
       LEFT JOIN nature_of_visit nov ON nov.id = a.nature_of_visit_id
       WHERE ${ownerCondition}
         AND (a.appointment_date > $3::date
              OR (a.appointment_date = $3::date AND a.appointment_time >= $4::time))
         AND a.appointment_date <= $3::date + ($2 || ' days')::INTERVAL
         AND a.status NOT IN ('cancelled', 'no_show', 'completed', 'pending', 'in_progress')
       ORDER BY a.appointment_date ASC, a.appointment_time ASC
       LIMIT 1`,
      [ownerParam, days, currentDate, currentTime],
    );

    res.json({ success: true, data: result.rows[0] || null });
  } catch (err) {
    next(err);
  }
};

// PATCH /appointments/:id  — partial update (any subset of fields)
export const patchAppointment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const allowed = [
      'appointment_date', 'appointment_time', 'duration_minutes',
      'appointment_type', 'nature_of_visit_id', 'reason', 'notes',
      'status', 'patient_id', 'doctor_id', 'department_id',
    ];
    const sets: string[] = [];
    const params: unknown[] = [];
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

    const result = await query(
      `UPDATE appointments SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Appointment not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// PATCH /appointments/:id/cancel
export const cancelAppointment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { cancellation_reason } = req.body;
    const cancelledBy = req.user?.userId;

    const result = await query(
      `UPDATE appointments
       SET status = 'cancelled',
           cancelled_by = $1,
           cancellation_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
         AND status NOT IN ('cancelled', 'completed', 'no_show')
       RETURNING *`,
      [cancelledBy ?? null, cancellation_reason ?? null, req.params.id],
    );

    if (result.rows.length === 0) {
      const exists = await query(`SELECT status FROM appointments WHERE id = $1`, [req.params.id]);
      if (exists.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Appointment not found' });
      } else {
        res.status(409).json({ success: false, message: `Cannot cancel appointment with status: ${exists.rows[0].status}` });
      }
      return;
    }

    res.json({ success: true, message: 'Appointment cancelled successfully', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// GET /appointments/categories  — static enum values for dropdowns
export const getAppointmentCategories = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT DISTINCT specialization
       FROM doctors
       WHERE specialization IS NOT NULL AND specialization <> '' AND is_active = true
       ORDER BY specialization ASC`,
    );

    res.json({
      success: true,
      data: {
        doctor_specializations: result.rows.map((r: { specialization: string }) => r.specialization),
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /appointments/nature-of-visits
export const getNatureOfVisits = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT id, name, description
       FROM nature_of_visit
       WHERE is_active = true
       ORDER BY name ASC`,
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /appointments/:id/encounter
// Returns the full clinical record for a given appointment:
// encounter, vitals, diagnoses, prescriptions (with items),
// lab orders (with results), radiology orders (with results)
// ─────────────────────────────────────────────────────────────
export const getAppointmentEncounter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const appointmentId = req.params.id;

    const encRes = await query(
      `SELECT e.*,
              COALESCE(d.first_name || ' ' || d.last_name,
                       u.first_name || ' ' || u.last_name) AS doctor_name,
              d.specialization,
              CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
              p.patient_code
       FROM encounters e
       JOIN doctors d ON d.id = e.doctor_id
       LEFT JOIN users u ON u.id = d.user_id
       JOIN patients p ON p.id = e.patient_id
       WHERE e.appointment_id = $1`,
      [appointmentId],
    );

    if (encRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'No encounter found for this appointment' });
      return;
    }

    const encounter = encRes.rows[0];
    const encounterId = encounter.id;

    const [vitalsRes, diagRes, prescRes, labRes, radioRes, notesRes] = await Promise.all([
      query(
        `SELECT v.*, CONCAT(u.first_name,' ',u.last_name) AS recorded_by_name
         FROM vitals v
         LEFT JOIN users u ON u.id = v.recorded_by
         WHERE v.encounter_id = $1 ORDER BY v.recorded_at DESC`,
        [encounterId],
      ),
      query(
        `SELECT diag.*,
                COALESCE(d.first_name || ' ' || d.last_name,
                         u.first_name || ' ' || u.last_name) AS doctor_name
         FROM diagnoses diag
         JOIN doctors d ON d.id = diag.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         WHERE diag.encounter_id = $1 ORDER BY diag.diagnosed_date DESC`,
        [encounterId],
      ),
      query(
        `SELECT p.*,
                COALESCE(d.first_name || ' ' || d.last_name,
                         u.first_name || ' ' || u.last_name) AS doctor_name,
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id', pi.id, 'inventory_item_id', pi.inventory_item_id,
                    'medication_name', pi.medication_name,
                    'dosage', pi.dosage, 'frequency', pi.frequency,
                    'duration', pi.duration, 'quantity', pi.quantity,
                    'route', pi.route, 'instructions', pi.instructions,
                    'is_dispensed', pi.is_dispensed
                  ) ORDER BY pi.id
                ) AS items
         FROM prescriptions p
         JOIN doctors d ON d.id = p.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
         WHERE p.encounter_id = $1
         GROUP BY p.id, d.first_name, d.last_name, u.first_name, u.last_name
         ORDER BY p.prescription_date DESC`,
        [encounterId],
      ),
      query(
        `SELECT lo.*,
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id', loi.id, 'test_name', ltc.name, 'test_code', ltc.code,
                    'category', ltc.category, 'status', loi.status,
                    'result_value', loi.result_value, 'unit', loi.unit,
                    'normal_range', loi.normal_range, 'interpretation', loi.interpretation,
                    'result_notes', loi.result_notes, 'result_date', loi.result_date
                  ) ORDER BY loi.id
                ) AS results
         FROM lab_orders lo
         LEFT JOIN lab_order_items loi ON loi.lab_order_id = lo.id
         LEFT JOIN lab_test_catalog ltc ON ltc.id = loi.lab_test_id
         WHERE lo.encounter_id = $1
         GROUP BY lo.id ORDER BY lo.order_date DESC`,
        [encounterId],
      ),
      query(
        `SELECT ro.*,
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id', roi.id, 'test_name', rtc.name, 'modality', rtc.modality,
                    'status', roi.status, 'findings', roi.findings,
                    'impression', roi.impression, 'recommendation', roi.recommendation,
                    'image_url', roi.image_url, 'report_date', roi.report_date
                  ) ORDER BY roi.id
                ) AS results
         FROM radiology_orders ro
         LEFT JOIN radiology_order_items roi ON roi.radiology_order_id = ro.id
         LEFT JOIN radiology_test_catalog rtc ON rtc.id = roi.radiology_test_id
         WHERE ro.encounter_id = $1
         GROUP BY ro.id ORDER BY ro.order_date DESC`,
        [encounterId],
      ),
      query(
        `SELECT cn.*, CONCAT(u.first_name,' ',u.last_name) AS doctor_name
         FROM clinical_notes cn
         JOIN users u ON u.id = cn.doctor_id
         WHERE cn.encounter_id = $1 ORDER BY cn.created_at ASC`,
        [encounterId],
      ),
    ]);

    res.json({
      success: true,
      data: {
        encounter:        { ...encounter, clinical_notes: notesRes.rows },
        vitals:           vitalsRes.rows,
        diagnoses:        diagRes.rows,
        prescriptions:    prescRes.rows,
        lab_orders:       labRes.rows,
        radiology_orders: radioRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// POST /appointments/:id/encounter
// Creates a full clinical record in one transaction:
// encounter, vitals, diagnoses, prescriptions, lab orders, radiology orders
//
// Body:
// {
//   encounter: { encounter_type, chief_complaint, history_of_present_illness,
//                physical_examination, assessment, plan, follow_up_date },
//   vitals?: { temperature, blood_pressure_systolic, blood_pressure_diastolic,
//              heart_rate, respiratory_rate, oxygen_saturation,
//              weight, height, bmi, blood_glucose, pain_scale, notes },
//   diagnoses?: [{ icd_code, diagnosis_text, diagnosis_type, status, notes }],
//   prescriptions?: [{ notes, valid_until, items: [{ inventory_item_id?, medication_name, dosage,
//                       frequency, duration, quantity, route, instructions }] }],
//   lab_orders?: [{ priority, clinical_notes, test_ids: number[] }],
//   radiology_orders?: [{ priority, clinical_notes, test_ids: number[] }]
// }
// ─────────────────────────────────────────────────────────────
export const saveAppointmentEncounter = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const appointmentId = req.params.id;
    const userId = req.user?.userId;

    // Resolve appointment → patient_id, doctor_id
    const apptRes = await client.query(
      `SELECT patient_id, doctor_id FROM appointments WHERE id = $1`,
      [appointmentId],
    );
    if (apptRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Appointment not found' });
      await client.query('ROLLBACK');
      return;
    }
    const { patient_id, doctor_id } = apptRes.rows[0];

    const {
      encounter: enc,
      vitals,
      diagnoses,
      prescriptions,
      lab_orders,
      radiology_orders,
    } = req.body;

    // 1. Encounter
    const encRow = await client.query(
      `INSERT INTO encounters
         (appointment_id, patient_id, doctor_id, encounter_type,
          chief_complaint, history_of_present_illness, physical_examination,
          assessment, plan, follow_up_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'in_progress')
       RETURNING *`,
      [appointmentId, patient_id, doctor_id,
       enc?.encounter_type ?? 'outpatient',
       enc?.chief_complaint ?? null,
       enc?.history_of_present_illness ?? null,
       enc?.physical_examination ?? null,
       enc?.assessment ?? null,
       enc?.plan ?? null,
       enc?.follow_up_date ?? null],
    );
    const encounter = encRow.rows[0];
    const encounterId = encounter.id;

    await client.query(
      `UPDATE appointments SET status = 'in_progress' WHERE id = $1`,
      [appointmentId],
    );

    // 2. Vitals
    if (vitals) {
      await client.query(
        `INSERT INTO vitals
           (encounter_id, patient_id, recorded_by,
            temperature, blood_pressure_systolic, blood_pressure_diastolic,
            heart_rate, respiratory_rate, oxygen_saturation,
            weight, height, bmi, blood_glucose, pain_scale, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [encounterId, patient_id, userId,
         vitals.temperature ?? null, vitals.blood_pressure_systolic ?? null,
         vitals.blood_pressure_diastolic ?? null, vitals.heart_rate ?? null,
         vitals.respiratory_rate ?? null, vitals.oxygen_saturation ?? null,
         vitals.weight ?? null, vitals.height ?? null, vitals.bmi ?? null,
         vitals.blood_glucose ?? null, vitals.pain_scale ?? null,
         vitals.notes ?? null],
      );
    }

    // 3. Diagnoses
    if (Array.isArray(diagnoses)) {
      for (const d of diagnoses) {
        await client.query(
          `INSERT INTO diagnoses
             (encounter_id, patient_id, doctor_id, icd_code, diagnosis_text,
              diagnosis_type, status, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [encounterId, patient_id, doctor_id,
           d.icd_code ?? null, d.diagnosis_text,
           d.diagnosis_type ?? 'primary', d.status ?? 'active',
           d.notes ?? null],
        );
      }
    }

    // 4. Prescriptions
    if (Array.isArray(prescriptions)) {
      for (const pres of prescriptions) {
        const presRow = await client.query(
          `INSERT INTO prescriptions
             (encounter_id, patient_id, doctor_id, valid_until, notes)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [encounterId, patient_id, doctor_id,
           pres.valid_until ?? null, pres.notes ?? null],
        );
        const presId = presRow.rows[0].id;
        if (Array.isArray(pres.items)) {
          for (const item of pres.items) {
            await client.query(
              `INSERT INTO prescription_items
                 (prescription_id, inventory_item_id, medication_name, dosage,
                  frequency, duration, quantity, route, instructions)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [presId, item.inventory_item_id ?? null, item.medication_name,
               item.dosage, item.frequency, item.duration ?? null,
               item.quantity, item.route ?? null, item.instructions ?? null],
            );
          }
        }
      }
    }

    // 5. Lab orders
    if (Array.isArray(lab_orders)) {
      for (const lo of lab_orders) {
        const loRow = await client.query(
          `INSERT INTO lab_orders
             (encounter_id, patient_id, doctor_id, ordered_by, priority, clinical_notes)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [encounterId, patient_id, doctor_id, userId,
           lo.priority ?? 'routine', lo.clinical_notes ?? null],
        );
        const loId = loRow.rows[0].id;
        if (Array.isArray(lo.test_ids)) {
          for (const testId of lo.test_ids) {
            await client.query(
              `INSERT INTO lab_order_items (lab_order_id, lab_test_id) VALUES ($1,$2)`,
              [loId, testId],
            );
          }
        }
      }
    }

    // 6. Radiology orders
    if (Array.isArray(radiology_orders)) {
      for (const ro of radiology_orders) {
        const roRow = await client.query(
          `INSERT INTO radiology_orders
             (encounter_id, patient_id, doctor_id, ordered_by, priority, clinical_notes)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [encounterId, patient_id, doctor_id, userId,
           ro.priority ?? 'routine', ro.clinical_notes ?? null],
        );
        const roId = roRow.rows[0].id;
        if (Array.isArray(ro.test_ids)) {
          for (const testId of ro.test_ids) {
            await client.query(
              `INSERT INTO radiology_order_items (radiology_order_id, radiology_test_id) VALUES ($1,$2)`,
              [roId, testId],
            );
          }
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { encounter_id: encounterId } });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /appointments/:id/encounter
// Partial update — send only the sections you want to update.
//
// Body (all optional):
// {
//   encounter?: { chief_complaint, hpi, physical_examination,
//                 assessment, plan, follow_up_date, status },
//   vitals?: { id?: number (if omitted, inserts new row),
//              temperature, blood_pressure_systolic, ... },
//   diagnoses?: [{ id: number, icd_code?, diagnosis_text?, status?, notes? }],
//   prescriptions?: [{ id: number, notes?, valid_until?, status? }],
//   prescription_items?: [{ id: number, medication_name?, dosage?,
//                           frequency?, duration?, quantity?,
//                           route?, instructions?, is_dispensed? }],
//   lab_order_items?: [{ id: number, result_value?, unit?,
//                        normal_range?, interpretation?, result_notes? }],
//   radiology_order_items?: [{ id: number, findings?, impression?,
//                               recommendation?, image_url? }]
// }
// ─────────────────────────────────────────────────────────────
export const updateAppointmentEncounter = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const appointmentId = req.params.id;
    const userId = req.user?.userId;

    const encRes = await client.query(
      `SELECT id, patient_id, doctor_id FROM encounters WHERE appointment_id = $1`,
      [appointmentId],
    );
    if (encRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'No encounter found for this appointment' });
      await client.query('ROLLBACK');
      return;
    }
    const { id: encounterId, patient_id, doctor_id } = encRes.rows[0];

    const {
      encounter,
      vitals,
      diagnoses,
      prescriptions,
      prescription_items,
      lab_order_items,
      radiology_order_items,
    } = req.body;

    // Update encounter fields
    if (encounter) {
      const fields: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      const allowed = ['chief_complaint','history_of_present_illness','physical_examination',
                       'assessment','plan','follow_up_date','status'];
      for (const key of allowed) {
        if (key in encounter) { fields.push(`${key} = $${i++}`); vals.push(encounter[key]); }
      }
      if (fields.length) {
        vals.push(encounterId);
        await client.query(
          `UPDATE encounters SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${i}`,
          vals,
        );
        if (encounter.status === 'completed') {
          await client.query(
            `UPDATE appointments SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [appointmentId],
          );
        }
      }
    }

    // Upsert vitals: if id given → update, else → insert
    if (vitals) {
      if (vitals.id) {
        const vFields: string[] = [];
        const vVals: unknown[] = [];
        let vi = 1;
        const vAllowed = ['temperature','blood_pressure_systolic','blood_pressure_diastolic',
                          'heart_rate','respiratory_rate','oxygen_saturation',
                          'weight','height','bmi','blood_glucose','pain_scale','notes'];
        for (const key of vAllowed) {
          if (key in vitals) { vFields.push(`${key} = $${vi++}`); vVals.push(vitals[key]); }
        }
        if (vFields.length) {
          vVals.push(vitals.id);
          await client.query(
            `UPDATE vitals SET ${vFields.join(', ')} WHERE id = $${vi}`,
            vVals,
          );
        }
      } else {
        await client.query(
          `INSERT INTO vitals
             (encounter_id, patient_id, recorded_by,
              temperature, blood_pressure_systolic, blood_pressure_diastolic,
              heart_rate, respiratory_rate, oxygen_saturation,
              weight, height, bmi, blood_glucose, pain_scale, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [encounterId, patient_id, userId,
           vitals.temperature ?? null, vitals.blood_pressure_systolic ?? null,
           vitals.blood_pressure_diastolic ?? null, vitals.heart_rate ?? null,
           vitals.respiratory_rate ?? null, vitals.oxygen_saturation ?? null,
           vitals.weight ?? null, vitals.height ?? null, vitals.bmi ?? null,
           vitals.blood_glucose ?? null, vitals.pain_scale ?? null,
           vitals.notes ?? null],
        );
      }
    }

    // Upsert diagnoses: no id → INSERT new, id present → UPDATE existing
    if (Array.isArray(diagnoses)) {
      for (const d of diagnoses) {
        if (!d.id) {
          // New diagnosis — insert it
          await client.query(
            `INSERT INTO diagnoses
               (encounter_id, patient_id, doctor_id, icd_code, diagnosis_text,
                diagnosis_type, status, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [encounterId, patient_id, doctor_id,
             d.icd_code ?? null, d.diagnosis_text,
             d.diagnosis_type ?? 'primary', d.status ?? 'active',
             d.notes ?? null],
          );
        } else {
          // Existing diagnosis — update it
          const dFields: string[] = [];
          const dVals: unknown[] = [];
          let di = 1;
          for (const key of ['icd_code','diagnosis_text','diagnosis_type','status','notes']) {
            if (key in d) { dFields.push(`${key} = $${di++}`); dVals.push(d[key]); }
          }
          if (dFields.length) {
            dVals.push(d.id);
            await client.query(
              `UPDATE diagnoses SET ${dFields.join(', ')} WHERE id = $${di} AND encounter_id = $${di + 1}`,
              [...dVals, encounterId],
            );
          }
        }
      }
    }

    // Update prescriptions by id
    if (Array.isArray(prescriptions)) {
      for (const p of prescriptions) {
        if (!p.id) continue;
        const pFields: string[] = [];
        const pVals: unknown[] = [];
        let pi = 1;
        for (const key of ['notes','valid_until','status']) {
          if (key in p) { pFields.push(`${key} = $${pi++}`); pVals.push(p[key]); }
        }
        if (pFields.length) {
          pVals.push(p.id);
          await client.query(
            `UPDATE prescriptions SET ${pFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
             WHERE id = $${pi} AND encounter_id = $${pi + 1}`,
            [...pVals, encounterId],
          );
        }
      }
    }

    // Update prescription items by id
    if (Array.isArray(prescription_items)) {
      for (const item of prescription_items) {
        if (!item.id) continue;
        const iFields: string[] = [];
        const iVals: unknown[] = [];
        let ii = 1;
        for (const key of ['inventory_item_id', 'medication_name','dosage','frequency','duration',
                            'quantity','route','instructions','is_dispensed']) {
          if (key in item) { iFields.push(`${key} = $${ii++}`); iVals.push(item[key]); }
        }
        if (iFields.length) {
          iVals.push(item.id);
          await client.query(
            `UPDATE prescription_items SET ${iFields.join(', ')} WHERE id = $${ii}`,
            iVals,
          );
        }
      }
    }

    // Update lab order items (results)
    if (Array.isArray(lab_order_items)) {
      for (const item of lab_order_items) {
        if (!item.id) continue;
        const lFields: string[] = [];
        const lVals: unknown[] = [];
        let li = 1;
        for (const key of ['result_value','unit','normal_range','interpretation','result_notes']) {
          if (key in item) { lFields.push(`${key} = $${li++}`); lVals.push(item[key]); }
        }
        if (lFields.length) {
          lVals.push(item.id);
          await client.query(
            `UPDATE lab_order_items
             SET ${lFields.join(', ')}, status = 'completed', result_date = CURRENT_TIMESTAMP,
                 performed_by = $${li + 1}
             WHERE id = $${li}`,
            [...lVals, userId],
          );
        }
      }
    }

    // Update radiology order items
    if (Array.isArray(radiology_order_items)) {
      for (const item of radiology_order_items) {
        if (!item.id) continue;
        const rFields: string[] = [];
        const rVals: unknown[] = [];
        let ri = 1;
        for (const key of ['findings','impression','recommendation','image_url']) {
          if (key in item) { rFields.push(`${key} = $${ri++}`); rVals.push(item[key]); }
        }
        if (rFields.length) {
          rVals.push(item.id);
          await client.query(
            `UPDATE radiology_order_items
             SET ${rFields.join(', ')}, status = 'completed', report_date = CURRENT_TIMESTAMP,
                 performed_by = $${ri + 1}
             WHERE id = $${ri}`,
            [...rVals, userId],
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Encounter updated successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// GET /appointments/range?start=YYYY-MM-DD&end=YYYY-MM-DD[&status=confirmed]
export const getAppointmentsByDateRange = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { start, end, status } = req.query as { start?: string; end?: string; status?: string };

    if (!start || !end) {
      res.status(400).json({ success: false, message: 'start and end query params are required (YYYY-MM-DD)' });
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start) || !dateRegex.test(end)) {
      res.status(400).json({ success: false, message: 'start and end must be in YYYY-MM-DD format' });
      return;
    }

    if (start > end) {
      res.status(400).json({ success: false, message: 'start date must not be after end date' });
      return;
    }

    const params: unknown[] = [start, end];
    let statusFilter = '';
    if (status) {
      params.push(status);
      statusFilter = `AND a.status = $3`;
    }

    const result = await query(
      `SELECT a.*,
              CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code, p.phone AS patient_phone,
              CONCAT(u.first_name,' ',u.last_name) AS doctor_name, doc.specialization,
              dept.name AS department
       FROM   appointments a
       JOIN   patients p    ON p.id   = a.patient_id
       JOIN   doctors doc   ON doc.id = a.doctor_id
       JOIN   users u       ON u.id   = doc.user_id
       LEFT JOIN departments dept ON dept.id = a.department_id
       WHERE  a.appointment_date BETWEEN $1 AND $2
       ${statusFilter}
       ORDER BY a.appointment_date ASC, a.appointment_time ASC`,
      params,
    );

    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (err) {
    next(err);
  }
};
