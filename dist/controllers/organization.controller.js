"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyOrganization = exports.getOrganizationStats = exports.updateOrganization = exports.createOrganization = exports.getOrganizationById = exports.getOrganizations = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
// GET /organizations  — super_admin only, list all orgs with stats
const getOrganizations = async (_req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT o.*,
            (SELECT COUNT(DISTINCT user_id) FROM (
              SELECT d.user_id AS user_id
              FROM doctors d
              JOIN branches b ON b.id = d.branch_id
              WHERE b.organization_id = o.id
              UNION
              SELECT a.patient_user_id AS user_id
              FROM appointments a
              JOIN branches b ON b.id = a.doctor_branch_id
              WHERE b.organization_id = o.id
            ) u) AS user_count,
            (SELECT COUNT(*) FROM doctors d
              JOIN branches b ON b.id = d.branch_id
              WHERE b.organization_id = o.id) AS doctor_count,
            (SELECT COUNT(DISTINCT a.patient_user_id) FROM appointments a
              JOIN branches b ON b.id = a.doctor_branch_id
              WHERE b.organization_id = o.id) AS patient_count,
            (SELECT COUNT(*) FROM appointments a
              JOIN branches b ON b.id = a.doctor_branch_id
              WHERE b.organization_id = o.id) AS appointment_count
       FROM organizations o
       ORDER BY o.created_at DESC`, []);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        next(err);
    }
};
exports.getOrganizations = getOrganizations;
// GET /organizations/:id  — super_admin only
const getOrganizationById = async (req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT o.*,
            (SELECT COUNT(*) FROM doctors d
              JOIN branches b ON b.id = d.branch_id
              WHERE b.organization_id = o.id) AS doctor_count,
            (SELECT COUNT(DISTINCT a.patient_user_id) FROM appointments a
              JOIN branches b ON b.id = a.doctor_branch_id
              WHERE b.organization_id = o.id) AS patient_count,
            (SELECT COUNT(*) FROM appointments a
              JOIN branches b ON b.id = a.doctor_branch_id
              WHERE b.organization_id = o.id) AS appointment_count
       FROM organizations o
       WHERE o.id = $1`, [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Organization not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.getOrganizationById = getOrganizationById;
// POST /organizations  — super_admin only, create new org + its admin user
// Body: { name, slug?, address?, phone?, email?, admin_first_name, admin_last_name, admin_email, admin_password? }
const createOrganization = async (req, res, next) => {
    const { name, slug, address, phone, email, category, admin_first_name, admin_last_name, admin_email, admin_password, } = req.body;
    const client = await (0, database_1.getClient)();
    try {
        await client.query('BEGIN');
        // Create the organization
        const orgRes = await client.query(`INSERT INTO organizations (name, slug, address, phone, email, category, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
       RETURNING *`, [name, slug ?? null, address ?? null, phone ?? null, email ?? null, category ?? null]);
        const org = orgRes.rows[0];
        // Create the org admin user
        const hash = await bcryptjs_1.default.hash(admin_password || 'Admin@12345', 12);
        const userRes = await client.query(`INSERT INTO users (role_id, first_name, last_name, email, password_hash, is_active, created_at, updated_at)
       VALUES ((SELECT id FROM roles WHERE name='admin'), $1, $2, $3, $4, true, NOW(), NOW())
       RETURNING id, email, first_name, last_name`, [admin_first_name, admin_last_name, admin_email, hash]);
        await client.query('COMMIT');
        res.status(201).json({
            success: true,
            data: {
                organization: org,
                admin_user: userRes.rows[0],
                admin_password: admin_password || 'Admin@12345',
            },
        });
    }
    catch (err) {
        await client.query('ROLLBACK');
        next(err);
    }
    finally {
        client.release();
    }
};
exports.createOrganization = createOrganization;
// PUT /organizations/:id  — super_admin only
const updateOrganization = async (req, res, next) => {
    try {
        const { name, slug, address, phone, email, is_active, category } = req.body;
        const result = await (0, database_1.query)(`UPDATE organizations SET
         name       = COALESCE($1, name),
         slug       = COALESCE($2, slug),
         address    = COALESCE($3, address),
         phone      = COALESCE($4, phone),
         email      = COALESCE($5, email),
         is_active  = COALESCE($6, is_active),
         category   = COALESCE($7, category),
         updated_at = NOW()
       WHERE id = $8
       RETURNING *`, [name ?? null, slug ?? null, address ?? null, phone ?? null, email ?? null, is_active ?? null, category ?? null, req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Organization not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.updateOrganization = updateOrganization;
// GET /organizations/:id/stats  — per-org dashboard numbers
const getOrganizationStats = async (req, res, next) => {
    try {
        const orgId = req.params.id;
        const [appts, patients, doctors, payments] = await Promise.all([
            (0, database_1.query)(`SELECT
           COUNT(*) FILTER (WHERE status = 'scheduled')       AS scheduled,
           COUNT(*) FILTER (WHERE status = 'confirmed')       AS confirmed,
           COUNT(*) FILTER (WHERE status = 'pending')         AS pending,
           COUNT(*) FILTER (WHERE status = 'in_progress')     AS in_progress,
           COUNT(*) FILTER (WHERE status = 'completed')       AS completed,
           COUNT(*) FILTER (WHERE status = 'cancelled')       AS cancelled,
           COUNT(*) FILTER (WHERE status = 'no_show')         AS no_show,
           COUNT(*) FILTER (WHERE status = 'payment_timeout') AS payment_timeout,
           COUNT(*) FILTER (WHERE status != 'payment_timeout') AS total,
           COUNT(*) FILTER (WHERE status IN ('confirmed','pending','completed')) AS paid,
           COUNT(*) FILTER (WHERE status = 'payment_timeout')                  AS unpaid
         FROM appointments a
         JOIN branches b ON b.id = a.doctor_branch_id
         WHERE b.organization_id = $1`, [orgId]),
            (0, database_1.query)(`SELECT COUNT(DISTINCT a.patient_user_id) AS total
         FROM appointments a
         JOIN branches b ON b.id = a.doctor_branch_id
         WHERE b.organization_id = $1`, [orgId]),
            (0, database_1.query)(`SELECT COUNT(*) AS total
         FROM doctors d
         JOIN branches b ON b.id = d.branch_id
         WHERE b.organization_id = $1`, [orgId]),
            (0, database_1.query)(`SELECT COALESCE(SUM(py.amount), 0) AS total_revenue
         FROM payments py
         JOIN appointments a ON a.id = py.appointment_id
         JOIN branches b ON b.id = a.doctor_branch_id
         WHERE b.organization_id = $1 AND py.payment_status = 'completed'`, [orgId]),
        ]);
        res.json({
            success: true,
            data: {
                appointments: appts.rows[0],
                patients: { total: parseInt(patients.rows[0].total, 10) },
                doctors: { total: parseInt(doctors.rows[0].total, 10) },
                revenue: { total: parseFloat(payments.rows[0].total_revenue) },
            },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getOrganizationStats = getOrganizationStats;
// GET /organizations/me  — org admin sees their own org
const getMyOrganization = async (req, res, next) => {
    try {
        const branchId = Number(req.query.branch_id || '');
        if (!branchId) {
            res.status(400).json({ success: false, message: 'branch_id query param is required' });
            return;
        }
        const result = await (0, database_1.query)(`SELECT o.*
       FROM organizations o
       JOIN branches b ON b.organization_id = o.id
       WHERE b.id = $1`, [branchId]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Organization not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.getMyOrganization = getMyOrganization;
//# sourceMappingURL=organization.controller.js.map