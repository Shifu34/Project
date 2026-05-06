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
              (SELECT COUNT(*) FROM users      WHERE organization_id = o.id AND role_id != (SELECT id FROM roles WHERE name='super_admin')) AS user_count,
              (SELECT COUNT(*) FROM doctors    WHERE organization_id = o.id) AS doctor_count,
              (SELECT COUNT(*) FROM patients   WHERE organization_id = o.id) AS patient_count,
              (SELECT COUNT(*) FROM appointments WHERE organization_id = o.id) AS appointment_count
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
              (SELECT COUNT(*) FROM doctors    WHERE organization_id = o.id) AS doctor_count,
              (SELECT COUNT(*) FROM patients   WHERE organization_id = o.id) AS patient_count,
              (SELECT COUNT(*) FROM appointments WHERE organization_id = o.id) AS appointment_count
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
    const { name, slug, address, phone, email, admin_first_name, admin_last_name, admin_email, admin_password, } = req.body;
    const client = await (0, database_1.getClient)();
    try {
        await client.query('BEGIN');
        // Create the organization
        const orgRes = await client.query(`INSERT INTO organizations (name, slug, address, phone, email, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       RETURNING *`, [name, slug ?? null, address ?? null, phone ?? null, email ?? null]);
        const org = orgRes.rows[0];
        // Create the org admin user
        const hash = await bcryptjs_1.default.hash(admin_password || 'Admin@12345', 12);
        const userRes = await client.query(`INSERT INTO users (role_id, first_name, last_name, email, password_hash, is_active, organization_id, created_at, updated_at)
       VALUES ((SELECT id FROM roles WHERE name='admin'), $1, $2, $3, $4, true, $5, NOW(), NOW())
       RETURNING id, email, first_name, last_name`, [admin_first_name, admin_last_name, admin_email, hash, org.id]);
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
        const { name, slug, address, phone, email, is_active } = req.body;
        const result = await (0, database_1.query)(`UPDATE organizations SET
         name       = COALESCE($1, name),
         slug       = COALESCE($2, slug),
         address    = COALESCE($3, address),
         phone      = COALESCE($4, phone),
         email      = COALESCE($5, email),
         is_active  = COALESCE($6, is_active),
         updated_at = NOW()
       WHERE id = $7
       RETURNING *`, [name ?? null, slug ?? null, address ?? null, phone ?? null, email ?? null, is_active ?? null, req.params.id]);
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
           COUNT(*) FILTER (WHERE status = 'scheduled')   AS scheduled,
           COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
           COUNT(*) FILTER (WHERE status = 'completed')   AS completed,
           COUNT(*) FILTER (WHERE status = 'cancelled')   AS cancelled,
           COUNT(*)                                        AS total
         FROM appointments WHERE organization_id = $1`, [orgId]),
            (0, database_1.query)('SELECT COUNT(*) AS total FROM patients WHERE organization_id = $1', [orgId]),
            (0, database_1.query)('SELECT COUNT(*) AS total FROM doctors  WHERE organization_id = $1', [orgId]),
            (0, database_1.query)(`SELECT COALESCE(SUM(py.amount_paid), 0) AS total_revenue
         FROM payments py
         JOIN appointments a ON a.id = py.appointment_id
         WHERE a.organization_id = $1 AND py.payment_status = 'paid'`, [orgId]),
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
        const orgId = req.user?.organizationId;
        if (!orgId) {
            res.status(404).json({ success: false, message: 'No organization associated with this account' });
            return;
        }
        const result = await (0, database_1.query)('SELECT * FROM organizations WHERE id = $1', [orgId]);
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