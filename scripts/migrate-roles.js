/**
 * migrate-roles.js
 *
 * Migrates the role system:
 *   super_admin  →  app_admin
 *   admin        →  org_admin
 *   (new)           branch_admin
 *
 * Adds organization_id + branch_id columns to users table.
 * Deletes the old org.admin@healix.com user and creates three fresh admin accounts.
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Add organization_id & branch_id columns to users (idempotent) ────
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS organization_id INT REFERENCES organizations(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS branch_id       INT REFERENCES branches(id)       ON DELETE SET NULL
    `);
    console.log('✓ Added organization_id, branch_id columns to users');

    // ── 2. Rename super_admin → app_admin (or insert if not present) ────────
    const saUpdate = await client.query(`UPDATE roles SET name = 'app_admin' WHERE name = 'super_admin'`);
    if (saUpdate.rowCount === 0) {
      await client.query(`
        INSERT INTO roles (name, description, permissions)
        VALUES ('app_admin', 'Application-level super administrator', '["all"]')
        ON CONFLICT (name) DO NOTHING
      `);
      console.log('✓ Inserted app_admin role (super_admin did not exist)');
    } else {
      console.log('✓ Renamed super_admin → app_admin');
    }

    // ── 3. Rename admin → org_admin (or insert if not present) ──────────────
    const aUpdate = await client.query(`UPDATE roles SET name = 'org_admin' WHERE name = 'admin'`);
    if (aUpdate.rowCount === 0) {
      await client.query(`
        INSERT INTO roles (name, description, permissions)
        VALUES ('org_admin', 'Administrator for a specific organization', '["manage_org"]')
        ON CONFLICT (name) DO NOTHING
      `);
      console.log('✓ Inserted org_admin role (admin did not exist)');
    } else {
      console.log('✓ Renamed admin → org_admin');
    }

    // ── 4. Insert branch_admin role (skip if already exists) ────────────────
    await client.query(`
      INSERT INTO roles (name, description, permissions)
      VALUES (
        'branch_admin',
        'Administrator for a specific branch only',
        '["manage_branch"]'
      )
      ON CONFLICT (name) DO NOTHING
    `);
    console.log('✓ Inserted branch_admin role');

    // ── 5. Delete the old org.admin@healix.com user ─────────────────────────
    const deleted = await client.query(`
      DELETE FROM users WHERE email = 'org.admin@healix.com' RETURNING id, email
    `);
    if (deleted.rows.length > 0) {
      console.log(`✓ Deleted old user: ${deleted.rows[0].email} (id=${deleted.rows[0].id})`);
    } else {
      console.log('  (no user found with email org.admin@healix.com — skipping delete)');
    }

    // ── 6. Look up first available org and branch to link the new admins ────
    const orgRes = await client.query(`SELECT id FROM organizations ORDER BY id LIMIT 1`);
    const branchRes = await client.query(`SELECT id, organization_id FROM branches ORDER BY id LIMIT 1`);

    const orgId    = orgRes.rows[0]?.id    ?? null;
    const branchId = branchRes.rows[0]?.id ?? null;

    if (!orgId)    console.warn('⚠  No organizations found — org_admin will have no organization_id');
    if (!branchId) console.warn('⚠  No branches found — branch_admin will have no branch_id');

    const hash = await bcrypt.hash('Admin@1234', 12);

    // ── 7. Create app_admin user ─────────────────────────────────────────────
    const appAdminRes = await client.query(`
      INSERT INTO users (role_id, first_name, last_name, email, password_hash, is_active, created_at, updated_at)
      VALUES (
        (SELECT id FROM roles WHERE name = 'app_admin'),
        'App', 'Admin', 'app.admin@healix.com', $1, true, NOW(), NOW()
      )
      ON CONFLICT (email) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            role_id       = EXCLUDED.role_id,
            updated_at    = NOW()
      RETURNING id, email
    `, [hash]);
    console.log(`✓ App admin created/updated: ${appAdminRes.rows[0].email} (id=${appAdminRes.rows[0].id})`);

    // ── 8. Create org_admin user ─────────────────────────────────────────────
    const orgAdminRes = await client.query(`
      INSERT INTO users (role_id, first_name, last_name, email, password_hash, organization_id, is_active, created_at, updated_at)
      VALUES (
        (SELECT id FROM roles WHERE name = 'org_admin'),
        'Org', 'Admin', 'org.admin@healix.com', $1, $2, true, NOW(), NOW()
      )
      ON CONFLICT (email) DO UPDATE
        SET password_hash   = EXCLUDED.password_hash,
            role_id         = EXCLUDED.role_id,
            organization_id = EXCLUDED.organization_id,
            updated_at      = NOW()
      RETURNING id, email, organization_id
    `, [hash, orgId]);
    console.log(`✓ Org admin created/updated: ${orgAdminRes.rows[0].email} (id=${orgAdminRes.rows[0].id}, org=${orgAdminRes.rows[0].organization_id})`);

    // ── 9. Create branch_admin user ──────────────────────────────────────────
    const branchAdminRes = await client.query(`
      INSERT INTO users (role_id, first_name, last_name, email, password_hash, organization_id, branch_id, is_active, created_at, updated_at)
      VALUES (
        (SELECT id FROM roles WHERE name = 'branch_admin'),
        'Branch', 'Admin', 'branch.admin@healix.com', $1, $2, $3, true, NOW(), NOW()
      )
      ON CONFLICT (email) DO UPDATE
        SET password_hash   = EXCLUDED.password_hash,
            role_id         = EXCLUDED.role_id,
            organization_id = EXCLUDED.organization_id,
            branch_id       = EXCLUDED.branch_id,
            updated_at      = NOW()
      RETURNING id, email, organization_id, branch_id
    `, [hash, orgId, branchId]);
    console.log(`✓ Branch admin created/updated: ${branchAdminRes.rows[0].email} (id=${branchAdminRes.rows[0].id}, org=${branchAdminRes.rows[0].organization_id}, branch=${branchAdminRes.rows[0].branch_id})`);

    await client.query('COMMIT');
    console.log('\n✅ Migration complete!');
    console.log('\n── Login credentials ──');
    console.log('  App Admin    → app.admin@healix.com  / Admin@1234');
    console.log('  Org Admin    → org.admin@healix.com  / Admin@1234');
    console.log('  Branch Admin → branch.admin@healix.com / Admin@1234');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
