#!/usr/bin/env node

// Copy catalog tables from a source DB to a destination DB, then create one doctor and one patient.

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const srcUrl = process.env.SRC_DATABASE_URL;
const destUrl = process.env.DEST_DATABASE_URL;

if (!srcUrl || !destUrl) {
  console.error('Missing SRC_DATABASE_URL or DEST_DATABASE_URL');
  process.exit(1);
}

const src = new Pool({ connectionString: srcUrl, ssl: { rejectUnauthorized: false } });
const dest = new Pool({ connectionString: destUrl, ssl: { rejectUnauthorized: false } });

const tables = [
  {
    name: 'organizations',
    columns: ['id', 'name', 'slug', 'address', 'phone', 'email', 'logo_url', 'category', 'is_active', 'created_at', 'updated_at'],
  },
  {
    name: 'branches',
    columns: ['id', 'organization_id', 'branch_seq', 'branch_code', 'name', 'location', 'phone', 'email', 'is_active', 'created_at', 'updated_at'],
  },
  {
    name: 'roles',
    columns: ['id', 'name', 'description', 'permissions', 'created_at'],
  },
  {
    name: 'departments',
    // Exclude head_user_id to avoid FK issues when users are not copied.
    columns: ['id', 'branch_id', 'name', 'description', 'phone', 'location', 'is_active', 'created_at', 'updated_at'],
  },
  {
    name: 'nature_of_visit',
    columns: ['id', 'name', 'description', 'is_active', 'created_at'],
  },
  {
    name: 'insurance_providers',
    columns: ['id', 'name', 'contact_phone', 'contact_email', 'address', 'website', 'is_active', 'created_at', 'updated_at'],
  },
  {
    name: 'lab_test_catalog',
    columns: ['id', 'branch_id', 'name', 'code', 'category', 'description', 'normal_range', 'lo_bound', 'hi_bound', 'unit', 'price', 'turnaround_hours', 'is_active', 'created_at'],
  },
  {
    name: 'radiology_test_catalog',
    columns: ['id', 'branch_id', 'name', 'code', 'modality', 'description', 'price', 'turnaround_hours', 'is_active', 'created_at'],
  },
  {
    name: 'inventory_items',
    columns: ['id', 'branch_id', 'name', 'generic_name', 'category', 'dosage_form', 'strength', 'unit', 'description', 'reorder_level', 'quantity_available', 'is_controlled', 'is_active', 'created_at', 'updated_at'],
  },
  {
    name: 'subscription_plans',
    columns: ['id', 'name', 'description', 'price', 'billing_cycle', 'features', 'max_users', 'max_patients', 'is_active', 'created_at', 'updated_at'],
  },
];

const serialTables = [
  'organizations',
  'branches',
  'roles',
  'departments',
  'nature_of_visit',
  'insurance_providers',
  'lab_test_catalog',
  'radiology_test_catalog',
  'inventory_items',
  'subscription_plans',
  'users',
  'patients',
  'doctors',
];

async function copyTable(table) {
  const colList = table.columns.join(', ');
  const res = await src.query(`SELECT ${colList} FROM ${table.name} ORDER BY id`);
  if (res.rows.length === 0) return 0;

  const placeholders = table.columns.map((_, i) => `$${i + 1}`).join(', ');
  const updateCols = table.columns.filter((c) => c !== 'id');
  const updateSet = updateCols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  const insertSql = `INSERT INTO ${table.name} (${colList}) VALUES (${placeholders})
    ON CONFLICT (id) DO UPDATE SET ${updateSet}`;

  for (const row of res.rows) {
    const values = table.columns.map((c) => row[c]);
    await dest.query(insertSql, values);
  }
  return res.rows.length;
}

async function ensureRoleId(roleName) {
  const res = await dest.query('SELECT id FROM roles WHERE name = $1 LIMIT 1', [roleName]);
  if (res.rows.length > 0) return res.rows[0].id;

  const ins = await dest.query(
    `INSERT INTO roles (name, permissions) VALUES ($1, $2) RETURNING id`,
    [roleName, '[]'],
  );
  return ins.rows[0].id;
}

async function ensureUser({ roleName, email, password, firstName, lastName, phone }) {
  const roleId = await ensureRoleId(roleName);
  const hash = await bcrypt.hash(password, 12);
  const res = await dest.query(
    `INSERT INTO users (role_id, first_name, last_name, email, password_hash, phone, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,true)
     ON CONFLICT (email) DO UPDATE SET
       role_id = EXCLUDED.role_id,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       password_hash = EXCLUDED.password_hash,
       phone = EXCLUDED.phone,
       is_active = true
     RETURNING id`,
    [roleId, firstName, lastName, email, hash, phone],
  );
  return res.rows[0].id;
}

async function ensurePatient(userId, { firstName, lastName, email, phone, dateOfBirth, gender }) {
  const existing = await dest.query('SELECT id FROM patients WHERE user_id = $1 LIMIT 1', [userId]);
  if (existing.rows.length > 0) {
    await dest.query(
      `UPDATE patients
       SET first_name = $1, last_name = $2, email = $3, phone = $4, gender = $5, date_of_birth = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [firstName, lastName, email, phone, gender, dateOfBirth, existing.rows[0].id],
    );
    return existing.rows[0].id;
  }

  const res = await dest.query(
    `INSERT INTO patients (user_id, first_name, last_name, email, phone, gender, date_of_birth)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [userId, firstName, lastName, email, phone, gender, dateOfBirth],
  );
  return res.rows[0].id;
}

async function ensureDoctor(userId, { firstName, lastName, email, phone, branchId, departmentId }) {
  const existing = await dest.query('SELECT employee_id FROM doctors WHERE user_id = $1 LIMIT 1', [userId]);
  if (existing.rows.length > 0) {
    await dest.query(
      `UPDATE doctors
       SET first_name = $1, last_name = $2, email = $3, phone = $4,
           branch_id = $5, department_id = $6, account_status = 'active', updated_at = CURRENT_TIMESTAMP
       WHERE employee_id = $7`,
      [firstName, lastName, email, phone, branchId, departmentId, existing.rows[0].employee_id],
    );
    return existing.rows[0].employee_id;
  }

  const res = await dest.query(
    `INSERT INTO doctors (user_id, branch_id, department_id, first_name, last_name, email, phone, account_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'active')
     RETURNING employee_id`,
    [userId, branchId, departmentId, firstName, lastName, email, phone],
  );
  return res.rows[0].employee_id;
}

async function resetSequences() {
  for (const table of serialTables) {
    const seqRes = await dest.query(`SELECT pg_get_serial_sequence($1, 'id') AS seq`, [table]);
    const seq = seqRes.rows[0]?.seq;
    if (!seq) continue;
    await dest.query(
      `SELECT setval('${seq}', COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`
    );
  }
}

async function main() {
  try {
    for (const table of tables) {
      const count = await copyTable(table);
      console.log(`Copied ${count} rows into ${table.name}`);
    }

    const branchRes = await dest.query('SELECT id FROM branches ORDER BY id LIMIT 1');
    if (branchRes.rows.length === 0) {
      throw new Error('No branches found in destination DB. Copy catalogs first.');
    }
    const branchId = branchRes.rows[0].id;

    const deptRes = await dest.query('SELECT id FROM departments ORDER BY id LIMIT 1');
    const departmentId = deptRes.rows[0]?.id ?? null;

    const patientUserId = await ensureUser({
      roleName: 'patient',
      email: 'a@a.com',
      password: 'Test@123',
      firstName: process.env.PATIENT_FIRST_NAME || 'Test',
      lastName: process.env.PATIENT_LAST_NAME || 'Patient',
      phone: process.env.PATIENT_PHONE || '0000000000',
    });

    await ensurePatient(patientUserId, {
      firstName: process.env.PATIENT_FIRST_NAME || 'Test',
      lastName: process.env.PATIENT_LAST_NAME || 'Patient',
      email: 'a@a.com',
      phone: process.env.PATIENT_PHONE || '0000000000',
      dateOfBirth: process.env.PATIENT_DOB || '1990-01-01',
      gender: process.env.PATIENT_GENDER || 'other',
    });

    const doctorUserId = await ensureUser({
      roleName: 'doctor',
      email: 'dr@dr.com',
      password: 'password',
      firstName: process.env.DOCTOR_FIRST_NAME || 'Dr',
      lastName: process.env.DOCTOR_LAST_NAME || 'Doctor',
      phone: process.env.DOCTOR_PHONE || '0000000000',
    });

    await ensureDoctor(doctorUserId, {
      firstName: process.env.DOCTOR_FIRST_NAME || 'Dr',
      lastName: process.env.DOCTOR_LAST_NAME || 'Doctor',
      email: 'dr@dr.com',
      phone: process.env.DOCTOR_PHONE || '0000000000',
      branchId,
      departmentId,
    });

    await resetSequences();
    console.log('Done.');
  } finally {
    await src.end();
    await dest.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
