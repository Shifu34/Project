import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// GET /appointments
export const getAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page   = Math.max(1,   parseInt(req.params.page as string || '1',  10));
    const size   = Math.min(100, parseInt(req.params.size as string || '20', 10));
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
      duration_minutes, appointment_type, nature_of_visit, reason, notes,
    } = req.body;

    const bookedBy = (req as Request & { user?: { userId: number } }).user?.userId;

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
          duration_minutes, appointment_type, nature_of_visit, reason, notes, booked_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [patient_id, doctor_id, department_id, appointment_date, appointment_time,
       duration_minutes || 30, appointment_type || 'Online Consultation', nature_of_visit, reason, notes, bookedBy],
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
      appointment_type, nature_of_visit, reason, notes,
    } = req.body;

    const result = await query(
      `UPDATE appointments
       SET appointment_date=$1, appointment_time=$2, duration_minutes=$3,
           appointment_type=$4, nature_of_visit=$5, reason=$6, notes=$7
       WHERE id = $8 RETURNING *`,
      [appointment_date, appointment_time, duration_minutes, appointment_type, nature_of_visit, reason, notes, req.params.id],
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
           a.appointment_type, a.nature_of_visit, a.status, a.reason, a.notes,
           a.cancellation_reason, a.created_at,
           CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code, p.phone AS patient_phone,
           doc.id AS doctor_id,
           CONCAT(doc.first_name,' ',doc.last_name) AS doctor_name,
           doc.specialization, doc.consultation_fee,
           dept.name AS department
         FROM appointments a
         JOIN patients p   ON p.id   = a.patient_id
         JOIN doctors doc  ON doc.id = a.doctor_id
         LEFT JOIN departments dept ON dept.id = a.department_id
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
