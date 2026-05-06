import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// GET /organizations  — super_admin only, list all orgs with stats
export const getOrganizations = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT o.*,
              (SELECT COUNT(*) FROM users      WHERE organization_id = o.id AND role_id != (SELECT id FROM roles WHERE name='super_admin')) AS user_count,
              (SELECT COUNT(*) FROM doctors    WHERE organization_id = o.id) AS doctor_count,
              (SELECT COUNT(*) FROM patients   WHERE organization_id = o.id) AS patient_count,
              (SELECT COUNT(*) FROM appointments WHERE organization_id = o.id) AS appointment_count
       FROM organizations o
       ORDER BY o.created_at DESC`,
      [],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// GET /organizations/:id  — super_admin only
export const getOrganizationById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `SELECT o.*,
              (SELECT COUNT(*) FROM doctors    WHERE organization_id = o.id) AS doctor_count,
              (SELECT COUNT(*) FROM patients   WHERE organization_id = o.id) AS patient_count,
              (SELECT COUNT(*) FROM appointments WHERE organization_id = o.id) AS appointment_count
       FROM organizations o
       WHERE o.id = $1`,
      [req.params.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Organization not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /organizations  — super_admin only, create new org + its admin user
// Body: { name, slug?, address?, phone?, email?, admin_first_name, admin_last_name, admin_email, admin_password? }
export const createOrganization = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const {
    name, slug, address, phone, email,
    admin_first_name, admin_last_name, admin_email, admin_password,
  } = req.body;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Create the organization
    const orgRes = await client.query(
      `INSERT INTO organizations (name, slug, address, phone, email, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       RETURNING *`,
      [name, slug ?? null, address ?? null, phone ?? null, email ?? null],
    );
    const org = orgRes.rows[0];

    // Create the org admin user
    const hash = await bcrypt.hash(admin_password || 'Admin@12345', 12);
    const userRes = await client.query(
      `INSERT INTO users (role_id, first_name, last_name, email, password_hash, is_active, organization_id, created_at, updated_at)
       VALUES ((SELECT id FROM roles WHERE name='admin'), $1, $2, $3, $4, true, $5, NOW(), NOW())
       RETURNING id, email, first_name, last_name`,
      [admin_first_name, admin_last_name, admin_email, hash, org.id],
    );

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      data: {
        organization: org,
        admin_user: userRes.rows[0],
        admin_password: admin_password || 'Admin@12345',
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// PUT /organizations/:id  — super_admin only
export const updateOrganization = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, slug, address, phone, email, is_active } = req.body;
    const result = await query(
      `UPDATE organizations SET
         name       = COALESCE($1, name),
         slug       = COALESCE($2, slug),
         address    = COALESCE($3, address),
         phone      = COALESCE($4, phone),
         email      = COALESCE($5, email),
         is_active  = COALESCE($6, is_active),
         updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [name ?? null, slug ?? null, address ?? null, phone ?? null, email ?? null, is_active ?? null, req.params.id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Organization not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// GET /organizations/:id/stats  — per-org dashboard numbers
export const getOrganizationStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.params.id;
    const [appts, patients, doctors, payments] = await Promise.all([
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'scheduled')   AS scheduled,
           COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
           COUNT(*) FILTER (WHERE status = 'completed')   AS completed,
           COUNT(*) FILTER (WHERE status = 'cancelled')   AS cancelled,
           COUNT(*)                                        AS total
         FROM appointments WHERE organization_id = $1`,
        [orgId],
      ),
      query('SELECT COUNT(*) AS total FROM patients WHERE organization_id = $1', [orgId]),
      query('SELECT COUNT(*) AS total FROM doctors  WHERE organization_id = $1', [orgId]),
      query(
        `SELECT COALESCE(SUM(py.amount_paid), 0) AS total_revenue
         FROM payments py
         JOIN appointments a ON a.id = py.appointment_id
         WHERE a.organization_id = $1 AND py.payment_status = 'paid'`,
        [orgId],
      ),
    ]);

    res.json({
      success: true,
      data: {
        appointments: appts.rows[0],
        patients:     { total: parseInt(patients.rows[0].total, 10) },
        doctors:      { total: parseInt(doctors.rows[0].total, 10) },
        revenue:      { total: parseFloat(payments.rows[0].total_revenue) },
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /organizations/me  — org admin sees their own org
export const getMyOrganization = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orgId = (req as AuthRequest).user?.organizationId;
    if (!orgId) {
      res.status(404).json({ success: false, message: 'No organization associated with this account' });
      return;
    }
    const result = await query('SELECT * FROM organizations WHERE id = $1', [orgId]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Organization not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};
