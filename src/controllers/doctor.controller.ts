import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

const getDayNameFromDate = (dateStr: string): string => {
  const d = new Date(`${dateStr}T00:00:00`);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[d.getDay()];
};

const canDoctorManageProfile = async (req: AuthRequest, doctorId: number): Promise<boolean> => {
  if (!req.user) return false;
  if (req.user.roleName === 'admin') return true;
  if (req.user.roleName !== 'doctor') return false;

  const ownDoctor = await query(`SELECT id FROM doctors WHERE user_id = $1 LIMIT 1`, [req.user.userId]);
  if (ownDoctor.rows.length === 0) return false;
  return Number(ownDoctor.rows[0].id) === doctorId;
};

// GET /doctors
export const getDoctors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page        = Math.max(1, parseInt(req.query.page as string   || '1',  10));
    const limit       = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const search      = (req.query.search      as string || '').trim();
    const department  = (req.query.department_id as string || '');
    const offset      = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[]   = [limit, offset];
    let idx = 3;

    if (search)     { conditions.push(`(u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx} OR d.specialization ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (department) { conditions.push(`d.department_id = $${idx}`); params.push(department); idx++; }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT d.id, d.user_id, d.specialization, d.license_number, d.qualification,
                d.experience_years, d.consultation_fee, d.is_active,
                COALESCE(u.first_name, d.first_name) AS first_name,
                COALESCE(u.last_name,  d.last_name)  AS last_name,
                COALESCE(u.email,      d.email)       AS email,
                COALESCE(u.phone,      d.phone)       AS phone,
                dept.name AS department
         FROM doctors d
         LEFT JOIN users u ON u.id = d.user_id
         LEFT JOIN departments dept ON dept.id = d.department_id
         ${where}
         ORDER BY COALESCE(u.first_name, d.first_name) ASC LIMIT $1 OFFSET $2`,
        params,
      ),
      query(
        `SELECT COUNT(*) FROM doctors d
         LEFT JOIN users u ON u.id = d.user_id
         LEFT JOIN departments dept ON dept.id = d.department_id ${where}`,
        conditions.length ? params.slice(2) : [],
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    res.json({ success: true, data: dataRes.rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

// GET /doctors/:id
export const getDoctorById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT d.*,
              COALESCE(u.first_name, d.first_name) AS first_name,
              COALESCE(u.last_name,  d.last_name)  AS last_name,
              COALESCE(u.email,      d.email)       AS email,
              COALESCE(u.phone,      d.phone)       AS phone,
              COALESCE(u.is_active,  d.is_active)   AS is_active,
              dept.name AS department
       FROM doctors d
       LEFT JOIN users u ON u.id = d.user_id
       LEFT JOIN departments dept ON dept.id = d.department_id
       WHERE d.id = $1`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Doctor not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// GET /doctors/me
export const getDoctorByUserId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { userId: number } }).user?.userId;
    const result = await query(
      `SELECT d.*,
              COALESCE(u.first_name, d.first_name) AS first_name,
              COALESCE(u.last_name,  d.last_name)  AS last_name,
              COALESCE(u.email,      d.email)       AS email,
              COALESCE(u.phone,      d.phone)       AS phone,
              COALESCE(u.is_active,  d.is_active)   AS is_active,
              dept.name AS department
       FROM doctors d
       LEFT JOIN users u ON u.id = d.user_id
       LEFT JOIN departments dept ON dept.id = d.department_id
       WHERE d.user_id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Doctor not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /doctors  – creates user + doctor profile atomically
export const createDoctor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      first_name, last_name, email, password, phone, gender, date_of_birth, address,
      department_id, specialization, license_number, qualification,
      experience_years, consultation_fee, bio,
    } = req.body;

    const reqUser = (req as Request & { user?: { organizationId?: number } }).user;

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const hash = await bcrypt.hash(password || 'Doctor@123', 12);

      const userRes = await client.query(
        `INSERT INTO users (role_id, first_name, last_name, email, password_hash, phone, is_active)
         VALUES ((SELECT id FROM roles WHERE name='doctor'),$1,$2,$3,$4,$5,true)
         RETURNING id`,
        [first_name, last_name, email, hash, phone],
      );
      const userId = userRes.rows[0].id;

      const docRes = await client.query(
        `INSERT INTO doctors
           (user_id, first_name, last_name, email, phone, gender, date_of_birth,
            department_id, specialization, license_number, qualification,
            experience_years, consultation_fee, bio)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [userId, first_name, last_name, email, phone, gender ?? null, date_of_birth ?? null,
         department_id ?? null, specialization ?? null, license_number ?? null, qualification ?? null,
         experience_years ?? null, consultation_fee ?? null, bio ?? null],
      );

      await client.query('COMMIT');
      res.status(201).json({ success: true, data: docRes.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
};

// PUT /doctors/:id
export const updateDoctor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      department_id, specialization, license_number, qualification,
      experience_years, consultation_fee, bio,
    } = req.body;

    const result = await query(
      `UPDATE doctors
       SET department_id=$1, specialization=$2, license_number=$3, qualification=$4,
           experience_years=$5, consultation_fee=$6, bio=$7
       WHERE id = $8 RETURNING *`,
      [department_id, specialization, license_number, qualification,
       experience_years, consultation_fee, bio, req.params.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Doctor not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// GET /doctors/:id/appointments  (today or by date)
export const getDoctorAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];

    const result = await query(
      `SELECT a.*, CONCAT(p.first_name,' ',p.last_name) AS patient_name,
              p.patient_code, p.phone AS patient_phone
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       WHERE a.doctor_id = $1 AND a.appointment_date = $2
       ORDER BY a.appointment_time ASC`,
      [req.params.id, date],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// GET /doctors/search  — public, no auth required
// Query params: q (name/dept/specialization), department (name), specialization, page, limit
export const searchDoctors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page           = Math.max(1,   parseInt(req.query.page  as string || '1',  10));
    const limit          = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const q              = (req.query.q              as string || '').trim();
    const department     = (req.query.department     as string || '').trim();
    const specialization = (req.query.specialization as string || '').trim();
    const offset         = (page - 1) * limit;

    const dataConditions: string[]  = ['d.is_active = true'];
    const dataParams: unknown[]     = [limit, offset];
    let dataIdx = 3;

    const countConditions: string[] = ['d.is_active = true'];
    const countParams: unknown[]    = [];
    let countIdx = 1;

    if (q) {
      const clause = `(CONCAT(COALESCE(u.first_name, d.first_name),' ',COALESCE(u.last_name, d.last_name)) ILIKE $${dataIdx} OR d.specialization ILIKE $${dataIdx} OR dept.name ILIKE $${dataIdx})`;
      dataConditions.push(clause);
      dataParams.push(`%${q}%`);
      dataIdx++;

      const cClause = `(CONCAT(COALESCE(u.first_name, d.first_name),' ',COALESCE(u.last_name, d.last_name)) ILIKE $${countIdx} OR d.specialization ILIKE $${countIdx} OR dept.name ILIKE $${countIdx})`;
      countConditions.push(cClause);
      countParams.push(`%${q}%`);
      countIdx++;
    }

    if (department) {
      dataConditions.push(`dept.name ILIKE $${dataIdx++}`);
      dataParams.push(`%${department}%`);
      countConditions.push(`dept.name ILIKE $${countIdx++}`);
      countParams.push(`%${department}%`);
    }

    if (specialization) {
      dataConditions.push(`d.specialization ILIKE $${dataIdx++}`);
      dataParams.push(`%${specialization}%`);
      countConditions.push(`d.specialization ILIKE $${countIdx++}`);
      countParams.push(`%${specialization}%`);
    }

    const where      = `WHERE ${dataConditions.join(' AND ')}`;
    const countWhere = `WHERE ${countConditions.join(' AND ')}`;

    const baseJoin = `
      FROM doctors d
      LEFT JOIN users u    ON u.id    = d.user_id
      LEFT JOIN departments dept ON dept.id = d.department_id`;

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT
           d.id, d.specialization, d.qualification, d.experience_years,
           d.consultation_fee, d.is_active,
           COALESCE(u.first_name, d.first_name) AS first_name,
           COALESCE(u.last_name,  d.last_name)  AS last_name,
           COALESCE(u.email,      d.email)       AS email,
           COALESCE(u.phone,      d.phone)       AS phone,
           dept.id AS department_id, dept.name AS department
         ${baseJoin}
         ${where}
         ORDER BY COALESCE(u.first_name, d.first_name) ASC
         LIMIT $1 OFFSET $2`,
        dataParams,
      ),
      query(
        `SELECT COUNT(*) ${baseJoin} ${countWhere}`,
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

// GET /doctors/:id/profile
export const getDoctorProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT d.id, d.user_id,
              COALESCE(u.first_name, d.first_name) AS first_name,
              COALESCE(u.last_name,  d.last_name)  AS last_name,
              COALESCE(u.email,      d.email)      AS email,
              COALESCE(u.phone,      d.phone)      AS phone,
              d.gender, d.date_of_birth, d.specialization, d.license_number,
              d.qualification, d.experience_years, d.consultation_fee,
              d.bio AS about, d.is_active,
              dept.id AS department_id,
              dept.name AS department,
              d.created_at, d.updated_at
       FROM doctors d
       LEFT JOIN users u ON u.id = d.user_id
       LEFT JOIN departments dept ON dept.id = d.department_id
       WHERE d.id = $1
       LIMIT 1`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Doctor not found' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// GET /doctors/:id/schedule?date=YYYY-MM-DD
export const getDoctorScheduleByDate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const dayOfWeek = getDayNameFromDate(date);

    const result = await query(
      `SELECT ds.id, ds.doctor_id, ds.day_of_week, ds.appointment_type,
              ds.start_time, ds.end_time, ds.max_appointments, ds.is_available,
              $2::date AS schedule_date,
              COALESCE(booked.booked_count, 0) AS booked_count,
              GREATEST(ds.max_appointments - COALESCE(booked.booked_count, 0), 0) AS remaining_slots
       FROM doctor_schedules ds
       LEFT JOIN (
         SELECT doctor_id, appointment_type, COUNT(*)::int AS booked_count
         FROM appointments
         WHERE doctor_id = $1
           AND appointment_date = $2
           AND status NOT IN ('cancelled', 'no_show')
         GROUP BY doctor_id, appointment_type
       ) booked
         ON booked.doctor_id = ds.doctor_id
        AND booked.appointment_type = ds.appointment_type
       WHERE ds.doctor_id = $1
         AND ds.day_of_week = $3
         AND ds.is_available = true
       ORDER BY ds.start_time ASC`,
      [req.params.id, date, dayOfWeek],
    );

    res.json({
      success: true,
      data: {
        doctor_id: Number(req.params.id),
        date,
        day_of_week: dayOfWeek,
        schedules: result.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /doctors/:id/profile
export const upsertDoctorProfileByDoctor = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const doctorId = parseInt(req.params.id, 10);
    const allowed = await canDoctorManageProfile(req, doctorId);
    if (!allowed) {
      res.status(403).json({ success: false, message: 'You can only update your own profile' });
      return;
    }

    const {
      first_name, last_name, email, phone, gender, date_of_birth,
      department_id, specialization, license_number, qualification,
      experience_years, consultation_fee, about,
    } = req.body;

    const result = await query(
      `UPDATE doctors
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           email = COALESCE($3, email),
           phone = COALESCE($4, phone),
           gender = COALESCE($5, gender),
           date_of_birth = COALESCE($6, date_of_birth),
           department_id = COALESCE($7, department_id),
           specialization = COALESCE($8, specialization),
           license_number = COALESCE($9, license_number),
           qualification = COALESCE($10, qualification),
           experience_years = COALESCE($11, experience_years),
           consultation_fee = COALESCE($12, consultation_fee),
           bio = COALESCE($13, bio),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $14
       RETURNING *`,
      [
        first_name ?? null,
        last_name ?? null,
        email ?? null,
        phone ?? null,
        gender ?? null,
        date_of_birth ?? null,
        department_id ?? null,
        specialization ?? null,
        license_number ?? null,
        qualification ?? null,
        experience_years ?? null,
        consultation_fee ?? null,
        about ?? null,
        doctorId,
      ],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Doctor not found' });
      return;
    }

    const doc = result.rows[0];
    if (doc.user_id) {
      await query(
        `UPDATE users
         SET first_name = COALESCE($1, first_name),
             last_name = COALESCE($2, last_name),
             email = COALESCE($3, email),
             phone = COALESCE($4, phone),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [first_name ?? null, last_name ?? null, email ?? null, phone ?? null, doc.user_id],
      );
    }

    res.json({ success: true, message: 'Doctor profile updated successfully', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /doctors/:id/schedule
// Accepts: { date, time_slots: [{ start_time, end_time, appointment_type, max_appointments, is_available }] }
export const addDoctorSchedule = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const doctorId = parseInt(req.params.id, 10);
    const allowed = await canDoctorManageProfile(req, doctorId);
    if (!allowed) {
      res.status(403).json({ success: false, message: 'You can only manage your own schedule' });
      return;
    }

    const { date, time_slots } = req.body;
    const dayOfWeek = getDayNameFromDate(date);

    const slots = Array.isArray(time_slots) ? time_slots : [];
    if (slots.length === 0) {
      res.status(400).json({ success: false, message: 'time_slots must be a non-empty array' });
      return;
    }

    const updatedRows: unknown[] = [];
    for (const slot of slots) {
      const startTime = slot.start_time;
      const endTime = slot.end_time;
      const appointmentType = slot.appointment_type || 'Online Consultation';
      const maxAppointments = slot.max_appointments ?? 20;
      const isAvailable = slot.is_available ?? true;

      if (!startTime || !endTime) {
        res.status(400).json({ success: false, message: 'Each slot must include start_time and end_time' });
        return;
      }

      const upsert = await query(
        `INSERT INTO doctor_schedules
           (doctor_id, day_of_week, appointment_type, start_time, end_time, max_appointments, is_available)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (doctor_id, day_of_week, appointment_type)
         DO UPDATE SET
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           max_appointments = EXCLUDED.max_appointments,
           is_available = EXCLUDED.is_available,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [doctorId, dayOfWeek, appointmentType, startTime, endTime, maxAppointments, isAvailable],
      );

      updatedRows.push(upsert.rows[0]);
    }

    res.status(201).json({
      success: true,
      message: 'Doctor schedule saved successfully',
      data: {
        doctor_id: doctorId,
        date,
        day_of_week: dayOfWeek,
        schedules: updatedRows,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /doctors/:id/booked-appointments?date=YYYY-MM-DD
export const getDoctorBookedAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];

    const result = await query(
      `SELECT a.id, a.appointment_date, a.appointment_time, a.duration_minutes,
              a.appointment_type, a.nature_of_visit, a.status, a.reason,
              p.id AS patient_id,
              CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
              p.patient_code, p.phone AS patient_phone
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       WHERE a.doctor_id = $1
         AND a.appointment_date = $2
         AND a.status NOT IN ('cancelled', 'no_show')
       ORDER BY a.appointment_time ASC`,
      [req.params.id, date],
    );

    res.json({ success: true, data: { doctor_id: Number(req.params.id), date, appointments: result.rows } });
  } catch (err) {
    next(err);
  }
};
