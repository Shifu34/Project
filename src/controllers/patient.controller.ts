import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// GET /patients  – paginated list
export const getPatients = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit  = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const search = (req.query.search as string || '').trim();
    const offset = (page - 1) * limit;

    // If caller is a doctor, restrict to patients they have appointments with
    let doctorId: number | null = null;
    if (req.user?.roleName === 'doctor') {
      const docRes = await query(`SELECT id FROM doctors WHERE user_id = $1 LIMIT 1`, [req.user.userId]);
      if (docRes.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Doctor profile not found' });
        return;
      }
      doctorId = docRes.rows[0].id;
    }

    const conditions: string[] = [];
    const dataParams: unknown[] = [limit, offset];
    const countParams: unknown[] = [];
    let dataIdx = 3;
    let countIdx = 1;

    if (doctorId !== null) {
      conditions.push(`p.id IN (SELECT DISTINCT patient_id FROM appointments WHERE doctor_id = $${dataIdx})`);
      dataParams.push(doctorId);
      dataIdx++;
      countParams.push(doctorId);
      countIdx++;
    }

    if (search) {
      const searchClause = `(p.first_name ILIKE $${dataIdx} OR p.last_name ILIKE $${dataIdx} OR p.patient_code ILIKE $${dataIdx} OR p.phone ILIKE $${dataIdx} OR p.email ILIKE $${dataIdx})`;
      conditions.push(searchClause);
      dataParams.push(`%${search}%`);
      dataIdx++;

      const cSearchClause = `(p.first_name ILIKE $${countIdx} OR p.last_name ILIKE $${countIdx} OR p.patient_code ILIKE $${countIdx} OR p.phone ILIKE $${countIdx} OR p.email ILIKE $${countIdx})`;
      const cParams = [...countParams, `%${search}%`];
      conditions.length > (doctorId !== null ? 1 : 0)
        ? countParams.push(`%${search}%`)
        : countParams.push(`%${search}%`);
      countIdx++;
      void cSearchClause; void cParams; // used below
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Rebuild count conditions with correct param indices (start from $1)
    const countConditions: string[] = [];
    const finalCountParams: unknown[] = [];
    let ci = 1;
    if (doctorId !== null) {
      countConditions.push(`p.id IN (SELECT DISTINCT patient_id FROM appointments WHERE doctor_id = $${ci++})`);
      finalCountParams.push(doctorId);
    }
    if (search) {
      countConditions.push(`(p.first_name ILIKE $${ci} OR p.last_name ILIKE $${ci} OR p.patient_code ILIKE $${ci} OR p.phone ILIKE $${ci} OR p.email ILIKE $${ci})`);
      finalCountParams.push(`%${search}%`);
    }
    const countWhere = countConditions.length ? `WHERE ${countConditions.join(' AND ')}` : '';

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT p.*, CONCAT(p.first_name,' ',p.last_name) AS full_name,
                DATE_PART('year', AGE(p.date_of_birth))::INT AS age
         FROM patients p ${where}
         ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
        dataParams,
      ),
      query(`SELECT COUNT(*) FROM patients p ${countWhere}`, finalCountParams),
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

// GET /patients/search?first_name=&last_name=&gender=&blood_type=&phone=&email=&patient_code=&date_of_birth=&page=&limit=
export const searchPatientsByParams = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page     = Math.max(1,   parseInt(req.query.page  as string || '1',  10));
    const limit    = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const offset   = (page - 1) * limit;

    const first_name    = (req.query.first_name    as string || '').trim();
    const last_name     = (req.query.last_name     as string || '').trim();
    const gender        = (req.query.gender        as string || '').trim();
    const blood_type    = (req.query.blood_type    as string || '').trim();
    const phone         = (req.query.phone         as string || '').trim();
    const email         = (req.query.email         as string || '').trim();
    const patient_code  = (req.query.patient_code  as string || '').trim();
    const date_of_birth = (req.query.date_of_birth as string || '').trim();

    // If caller is a doctor, restrict to their own patients
    let doctorId: number | null = null;
    if (req.user?.roleName === 'doctor') {
      const docRes = await query(`SELECT id FROM doctors WHERE user_id = $1 LIMIT 1`, [req.user.userId]);
      if (docRes.rows.length === 0) {
        res.status(404).json({ success: false, message: 'Doctor profile not found' });
        return;
      }
      doctorId = docRes.rows[0].id;
    }

    // Build filter list — doctor scope always first so param indices are consistent
    const filters: Array<[string, unknown]> = [];
    if (doctorId !== null) filters.push([`p.id IN (SELECT DISTINCT patient_id FROM appointments WHERE doctor_id = $IDX)`, doctorId]);
    if (first_name)    filters.push([`p.first_name ILIKE $IDX`,    `%${first_name}%`]);
    if (last_name)     filters.push([`p.last_name ILIKE $IDX`,     `%${last_name}%`]);
    if (gender)        filters.push([`p.gender = $IDX`,            gender]);
    if (blood_type)    filters.push([`p.blood_type ILIKE $IDX`,    `%${blood_type}%`]);
    if (phone)         filters.push([`p.phone ILIKE $IDX`,         `%${phone}%`]);
    if (email)         filters.push([`p.email ILIKE $IDX`,         `%${email}%`]);
    if (patient_code)  filters.push([`p.patient_code ILIKE $IDX`,  `%${patient_code}%`]);
    if (date_of_birth) filters.push([`p.date_of_birth = $IDX`,     date_of_birth]);

    const filterValues = filters.map(([, v]) => v);
    const dataConditions  = filters.map(([clause], i) => clause.replace('$IDX', `$${3 + i}`));
    const countConditions = filters.map(([clause], i) => clause.replace('$IDX', `$${1 + i}`));

    const where      = dataConditions.length  ? `WHERE ${dataConditions.join(' AND ')}`  : '';
    const countWhere = countConditions.length ? `WHERE ${countConditions.join(' AND ')}` : '';

    const dataParams: unknown[]  = [limit, offset, ...filterValues];
    const countParams: unknown[] = [...filterValues];

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT p.*, CONCAT(p.first_name,' ',p.last_name) AS full_name,
                DATE_PART('year', AGE(p.date_of_birth))::INT AS age
         FROM patients p ${where}
         ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
        dataParams,
      ),
      query(`SELECT COUNT(*) FROM patients p ${countWhere}`, countParams),
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

// GET /patients/:id
export const getPatientById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT p.*,
              DATE_PART('year', AGE(p.date_of_birth))::INT AS age,
              json_agg(DISTINCT jsonb_build_object(
                'id',ui.id,'provider_id',ui.insurance_provider_id,
                'policy_number',ui.policy_number,'is_active',ui.is_active
              )) FILTER (WHERE ui.id IS NOT NULL) AS insurance
       FROM patients p
       LEFT JOIN user_insurances ui ON ui.patient_id = p.id
       WHERE p.id = $1
       GROUP BY p.id`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Patient not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// GET /patients/me
export const getPatientByUserId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as Request & { user?: { userId: number } }).user?.userId;
    const result = await query(
      `SELECT p.*,
              DATE_PART('year', AGE(p.date_of_birth))::INT AS age,
              json_agg(DISTINCT jsonb_build_object(
                'id',ui.id,'provider_id',ui.insurance_provider_id,
                'policy_number',ui.policy_number,'is_primary',ui.is_primary
              )) FILTER (WHERE ui.id IS NOT NULL) AS insurance
       FROM patients p
       LEFT JOIN user_insurances ui ON ui.patient_id = p.id
       WHERE p.user_id = $1
       GROUP BY p.id`,
      [userId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Patient not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /patients
export const createPatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      first_name, last_name, email, phone, gender, date_of_birth,
      blood_type, address, emergency_contact_name, emergency_contact_phone,
      marital_status, password,
    } = req.body;

    const reqUser = (req as Request & { user?: { userId: number; organizationId?: number; roleId?: number } }).user;

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 1. Create login account in users table
      const hash = await bcrypt.hash(password, 12);
      const roleRes = await client.query(`SELECT id FROM roles WHERE name = 'patient' LIMIT 1`);
      const patientRoleId = roleRes.rows[0]?.id;

      const userRes = await client.query(
        `INSERT INTO users (organization_id, role_id, first_name, last_name, email, password_hash, phone, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [reqUser?.organizationId, patientRoleId, first_name, last_name, email, hash, phone, true],
      );
      const userId = userRes.rows[0].id;

      // 2. Create patient record linked to the user
      const patientRes = await client.query(
        `INSERT INTO patients
           (user_id, first_name, last_name, email, phone, gender, date_of_birth,
            blood_type, address, emergency_contact_name, emergency_contact_phone, marital_status,
            registered_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [userId, first_name, last_name, email, phone, gender, date_of_birth,
         blood_type, address, emergency_contact_name, emergency_contact_phone, marital_status,
         reqUser?.userId],
      );

      await client.query('COMMIT');
      res.status(201).json({ success: true, data: patientRes.rows[0] });
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

// PUT /patients/:id
// PUT /patients/me  – patient updates their own profile
export const updateMyProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await getClient();
  try {
    const userId = (req as Request & { user?: { userId: number } }).user?.userId;
    const {
      email, phone, gender,
      blood_type, address, emergency_contact_name, emergency_contact_phone,
      emergency_contact_relation, marital_status, occupation, nationality,
    } = req.body;

    await client.query('BEGIN');

    if (email !== undefined) {
      await client.query(
        `UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [email, userId],
      );
    }

    const result = await client.query(
      `UPDATE patients
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
       RETURNING *`,
      [email, phone, gender,
       blood_type, address, emergency_contact_name, emergency_contact_phone,
       emergency_contact_relation, marital_status, occupation, nationality, userId],
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Patient not found' });
      return;
    }

    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

export const updatePatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      first_name, last_name, email, phone, gender, date_of_birth,
      blood_group, address, emergency_contact_name, emergency_contact_phone,
      marital_status, is_active,
    } = req.body;

    const result = await query(
      `UPDATE patients
       SET first_name=$1, last_name=$2, email=$3, phone=$4, gender=$5,
           date_of_birth=$6, blood_group=$7, address=$8,
           emergency_contact_name=$9, emergency_contact_phone=$10,
           marital_status=$11, is_active=$12
       WHERE id = $13
       RETURNING *`,
      [first_name, last_name, email, phone, gender, date_of_birth,
       blood_group, address, emergency_contact_name, emergency_contact_phone,
       marital_status, is_active, req.params.id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Patient not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// DELETE /patients/:id  (soft delete – set status = inactive)
export const deletePatient = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `UPDATE patients SET is_active = FALSE WHERE id = $1 RETURNING id`,
      [req.params.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Patient not found' });
      return;
    }
    res.json({ success: true, message: 'Patient deactivated' });
  } catch (err) {
    next(err);
  }
};

// GET /patients/:id/appointments
export const getPatientAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT a.*, CONCAT(u.first_name,' ',u.last_name) AS doctor_name, d.name AS department
       FROM appointments a
       JOIN doctors doc ON doc.id = a.doctor_id
       JOIN users u ON u.id = doc.user_id
       LEFT JOIN departments d ON d.id = a.department_id
       WHERE a.patient_id = $1
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [req.params.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// GET /patients/:id/encounters
export const getPatientVisits = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT e.*, CONCAT(u.first_name,' ',u.last_name) AS doctor_name
       FROM encounters e
       JOIN doctors doc ON doc.id = e.doctor_id
       JOIN users u ON u.id = doc.user_id
       WHERE e.patient_id = $1
       ORDER BY e.encounter_date DESC`,
      [req.params.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// GET /patients/:id/medical-history  (diagnoses + prescriptions)
export const getPatientMedicalHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [diagRes, prescRes, labRes] = await Promise.all([
      query(
        `SELECT diag.*, CONCAT(u.first_name,' ',u.last_name) AS doctor_name
         FROM diagnoses diag
         JOIN doctors doc ON doc.id = diag.doctor_id
         JOIN users u ON u.id = doc.user_id
         WHERE diag.patient_id = $1
         ORDER BY diag.diagnosed_date DESC`,
        [req.params.id],
      ),
      query(
        `SELECT p.*, CONCAT(u.first_name,' ',u.last_name) AS doctor_name
         FROM prescriptions p
         JOIN doctors doc ON doc.id = p.doctor_id
         JOIN users u ON u.id = doc.user_id
         WHERE p.patient_id = $1
         ORDER BY p.prescription_date DESC`,
        [req.params.id],
      ),
      query(
        `SELECT lo.*, CONCAT(u.first_name,' ',u.last_name) AS doctor_name
         FROM lab_orders lo
         JOIN doctors doc ON doc.id = lo.doctor_id
         JOIN users u ON u.id = doc.user_id
         WHERE lo.patient_id = $1
         ORDER BY lo.order_date DESC`,
        [req.params.id],
      ),
    ]);

    res.json({
      success: true,
      data: { diagnoses: diagRes.rows, prescriptions: prescRes.rows, lab_orders: labRes.rows },
    });
  } catch (err) {
    next(err);
  }
};
