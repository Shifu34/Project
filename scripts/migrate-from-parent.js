/**
 * Murshid Hospital - Migration from Parent MySQL Dump → PostgreSQL
 *
 * Usage:
 *   node scripts/migrate-from-parent.js /Users/mikey/Downloads/Parent_DB.sql
 *
 * What it does:
 *   1. Streams the MySQL dump and extracts INSERT data for all relevant tables
 *   2. Transforms MySQL types/values to PostgreSQL-compatible values
 *   3. Inserts into our murshid_hospital PostgreSQL database in the correct order
 *
 * Run AFTER schema.sql has been executed in pgAdmin4.
 */

require('dotenv').config();
const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

// ─── PostgreSQL connection ────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME     || 'murshid_hospital',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const clean = (v) => {
  if (v === 'NULL' || v === null || v === undefined) return null;
  if (typeof v === 'string') {
    v = v.trim();
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    v = v.replace(/\\'/g, "'").replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  }
  return v === '' ? null : v;
};

const toBoolean = (v) => {
  const s = String(clean(v) ?? '0');
  return s === '1' || s.toLowerCase() === 'true';
};

const splitName = (fullName) => {
  if (!fullName) return { first: 'Unknown', last: 'Unknown' };
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(' ') };
};

const mapGender = (sex) => {
  const s = String(clean(sex) || '').toUpperCase();
  if (s === 'M') return 'male';
  if (s === 'F') return 'female';
  return 'other';
};

const mapBloodGroup = (bg) => {
  const valid = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
  const s = String(clean(bg) || '').trim().toUpperCase();
  if (valid.includes(s)) return s;
  if (s === 'AB') return 'AB+';
  return null;
};

const mapMaritalStatus = (ms) => {
  const s = String(clean(ms) || '').toLowerCase();
  if (s.includes('single'))   return 'single';
  if (s.includes('married'))  return 'married';
  if (s.includes('divorced')) return 'divorced';
  if (s.includes('widow'))    return 'widowed';
  return null;
};

const mapPatientStatus = (st) => {
  const s = String(clean(st) || '').toLowerCase();
  if (s.includes('dead') || s.includes('deceas')) return 'deceased';
  if (s.includes('inactive'))                      return 'inactive';
  return 'active';
};

const isValidDate = (d) => {
  if (!d || d === '0000-00-00' || d === '0000-00-00 00:00:00') return false;
  const s = String(d);
  // Reject MySQL partial dates like 'YYYY-00-00', 'YYYY-MM-00', 'YYYY-00-DD'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m && (m[2] === '00' || m[3] === '00')) return false;
  const parsed = new Date(s);
  return !isNaN(parsed.getTime());
};

/** Truncate a value to fit a VARCHAR(len) column */
const trunc = (v, len) => {
  if (v === null || v === undefined) return null;
  return String(v).substring(0, len);
};

/** Parse a single MySQL VALUES row into an array of raw token strings */
const parseValuesRow = (row) => {
  const tokens = [];
  let current = '';
  let inStr   = false;
  let strChar = '';
  let i = 0;
  while (i < row.length && row[i] !== '(') i++;
  i++; // skip (
  while (i < row.length) {
    const ch = row[i];
    if (!inStr) {
      if (ch === "'" || ch === '"') { inStr = true; strChar = ch; current += ch; }
      else if (ch === ',') { tokens.push(current.trim()); current = ''; }
      else if (ch === ')') { tokens.push(current.trim()); break; }
      else { current += ch; }
    } else {
      if (ch === '\\') { current += ch + (row[i + 1] || ''); i++; }
      else if (ch === strChar) { inStr = false; current += ch; }
      else { current += ch; }
    }
    i++;
  }
  return tokens;
};

// ─── Step 1: Stream SQL dump and collect rows for each table ─────────────────
const TABLES_WE_NEED = new Set([
  'care_department',
  'care_consultant_days',
  'care_procedure_type',
  'care_test_group',
  'care_test_param',
  'care_billing_item1',
  'stockmaster',
  'care_person',
  'care_encounter',
  'care_test_request',
  'care_test_findings',
]);

async function streamSQLDump(filePath) {
  return new Promise((resolve, reject) => {
    const data   = {};
    const schema = {};
    TABLES_WE_NEED.forEach((t) => { data[t] = []; });

    let currentTable = null;
    let insertBuffer = '';

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    let inCreate    = false;
    let createTable = null;
    let createCols  = [];

    rl.on('line', (line) => {
      const trimmed = line.trimStart();

      // ── CREATE TABLE ────────────────────────────────────────────────────────
      const createMatch = trimmed.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(/i);
      if (createMatch) {
        createTable = createMatch[1].toLowerCase();
        createCols  = [];
        inCreate    = TABLES_WE_NEED.has(createTable);
        return;
      }
      if (inCreate) {
        if (trimmed.startsWith(')')) {
          if (createTable) schema[createTable] = createCols;
          inCreate = false; createTable = null; createCols = [];
          return;
        }
        const colMatch = trimmed.match(/^`(\w+)`/);
        if (colMatch &&
            !trimmed.toUpperCase().startsWith('KEY') &&
            !trimmed.toUpperCase().startsWith('PRIMARY') &&
            !trimmed.toUpperCase().startsWith('UNIQUE') &&
            !trimmed.toUpperCase().startsWith('INDEX') &&
            !trimmed.toUpperCase().startsWith('FULLTEXT')) {
          createCols.push(colMatch[1].toLowerCase());
        }
        return;
      }

      // ── INSERT INTO ─────────────────────────────────────────────────────────
      const insertMatch = trimmed.match(
        /^INSERT\s+(?:IGNORE\s+)?INTO\s+`?(\w+)`?\s*(?:\([^)]*\)\s*)?VALUES\s*/i,
      );
      if (insertMatch) {
        currentTable = insertMatch[1].toLowerCase();
        insertBuffer = trimmed;
        if (!TABLES_WE_NEED.has(currentTable)) { currentTable = null; insertBuffer = ''; }
        return;
      }

      // ── Multi-line INSERT ───────────────────────────────────────────────────
      if (currentTable) {
        insertBuffer += ' ' + line;
        if (trimmed.endsWith(';')) {
          if (!schema[currentTable] || schema[currentTable].length === 0) {
            const colsMatch = insertBuffer.match(
              /INSERT\s+(?:IGNORE\s+)?INTO\s+`?\w+`?\s*\(([^)]+)\)\s*VALUES/i,
            );
            if (colsMatch) {
              schema[currentTable] = colsMatch[1]
                .split(',')
                .map((c) => c.trim().replace(/[`"]/g, '').toLowerCase());
            }
          }
          const rowRegex = /\((?:[^)(]|\((?:[^)(]|\([^)(]*\))*\))*\)/g;
          let m;
          while ((m = rowRegex.exec(insertBuffer)) !== null) {
            const tokens = parseValuesRow(m[0]);
            if (tokens.length > 0) data[currentTable].push(tokens);
          }
          currentTable = null;
          insertBuffer = '';
        }
      }
    });

    rl.on('close', () => resolve({ data, schema }));
    rl.on('error', reject);
  });
}

// ─── Step 2: Transform & Insert ───────────────────────────────────────────────
async function migrate(filePath) {
  console.log('\n🔄  Reading MySQL dump…\n');
  const { data, schema } = await streamSQLDump(filePath);

  console.log('📊  Rows extracted from dump:');
  for (const [t, rows] of Object.entries(data)) {
    console.log(`    ${t.padEnd(35)} ${rows.length} rows`);
  }
  console.log('');

  const client = await pool.connect();
  const errors = [];

  try {
    await client.query('BEGIN');

    // ── TRUNCATE everything ──────────────────────────────────────────────────
    console.log('🧹  Cleaning target tables…');
    await client.query(`
      TRUNCATE TABLE
        audit_logs, notifications,
        ai_transcripts, ai_outputs, ai_sessions,
        user_subscriptions, subscription_plans,
        radiology_order_items, radiology_orders, radiology_test_catalog,
        lab_order_items, lab_orders, lab_test_catalog,
        inventory_transactions, inventory_items,
        prescription_items, prescriptions,
        vitals, clinical_notes, diagnoses,
        encounters,
        user_insurances, insurance_providers,
        payments, payment_refunds,
        appointments,
        doctor_schedules, doctors,
        patients,
        user_profiles, users,
        departments, roles, organizations
      RESTART IDENTITY CASCADE
    `);
    await client.query('ALTER SEQUENCE patient_code_seq RESTART WITH 1');

    // ── toObj helper ─────────────────────────────────────────────────────────
    const toObj = (table, tokens) => {
      const cols = schema[table] || [];
      const obj  = {};
      cols.forEach((col, i) => { obj[col] = clean(tokens[i]); });
      return obj;
    };

    // =====================================================================
    //  0. ORGANIZATION — Murshid Hospital
    // =====================================================================
    console.log('🏢  Creating Murshid Hospital organization…');
    const orgRes = await client.query(
      `INSERT INTO organizations (name, slug, address, phone, email, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        'Murshid Hospital',
        'murshid-hospital',
        'Murshid Hospital, Karachi, Pakistan',
        '+92-21-32712481',
        'info@murshidhospital.com',
        true,
      ],
    );
    const orgId = orgRes.rows[0].id;
    console.log(`    ✓ Organization id = ${orgId}`);

    // =====================================================================
    //  1. ROLES
    // =====================================================================
    console.log('🔑  Creating roles…');
    const rolePermissions = {
      admin:   '{"patients":["read","write","delete"],"doctors":["read","write","delete"],"appointments":["read","write","delete"],"lab":["read","write","delete"],"billing":["read","write","delete"],"pharmacy":["read","write","delete"],"reports":["read","write"]}',
      doctor:  '{"patients":["read","write"],"appointments":["read","write"],"lab":["read","write"],"prescriptions":["read","write"],"billing":["read"]}',
      patient: '{"appointments":["read","write"],"lab":["read"],"prescriptions":["read"],"billing":["read"]}',
    };
    const roleNames = ['admin', 'doctor', 'patient'];
    const roleMap   = {};
    for (const name of roleNames) {
      const r = await client.query(
        `INSERT INTO roles (name, description, permissions) VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET permissions = EXCLUDED.permissions
         RETURNING id`,
        [name, `${name.replace('_', ' ')} role`, rolePermissions[name]],
      );
      roleMap[name] = r.rows[0].id;
    }
    console.log(`    ✓ ${roleNames.length} roles`);

    // =====================================================================
    //  2. ADMIN USER (system reference user)
    // =====================================================================
    console.log('👤  Creating admin user…');
    const adminHash = await bcrypt.hash('Admin@123', 10);
    const adminRes  = await client.query(
      `INSERT INTO users (role_id, first_name, last_name, email, password_hash, phone, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [roleMap.admin, 'System', 'Admin', 'admin@murshidhospital.com', adminHash, '+92-21-32712481', true],
    );
    const adminUserId = adminRes.rows[0].id;
    console.log(`    ✓ Admin user id = ${adminUserId}`);

    // Auto-wrap INSERT/UPDATE/DELETE with SAVEPOINT so one bad row
    // doesn't poison the entire PostgreSQL transaction.
    const _origQuery = client.query.bind(client);
    let _spN = 0;
    client.query = async function(text, values) {
      const sql = typeof text === 'string' ? text : (text && text.text) || '';
      if (/^(INSERT|UPDATE|DELETE)\b/i.test(sql.trim())) {
        const sp = `_sp${++_spN}`;
        await _origQuery(`SAVEPOINT ${sp}`);
        try {
          const res = await _origQuery(text, values);
          await _origQuery(`RELEASE SAVEPOINT ${sp}`);
          return res;
        } catch (e) {
          await _origQuery(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => {});
          throw e;
        }
      }
      return _origQuery(text, values);
    };

    // =====================================================================
    //  3. DEPARTMENTS (from care_department)
    // =====================================================================
    console.log('📁  Importing departments…');
    const deptNrToId = {};
    for (const tokens of data['care_department']) {
      const r    = toObj('care_department', tokens);
      const name = r['name_formal'] || r['id'] || 'Unnamed';
      if (name.includes('`')) continue; // skip header row
      const isActive = r['is_inactive'] !== '1' &&
                       String(r['status'] || '').toLowerCase() !== 'inactive';
      try {
        const res = await client.query(
          `INSERT INTO departments (organization_id, name, description, phone, is_active)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
           RETURNING id`,
          [orgId, name.substring(0, 100), r['description'], null, isActive],
        );
        if (r['nr']) deptNrToId[r['nr']] = res.rows[0].id;
      } catch (e) {
        errors.push(`dept: ${e.message}`);
      }
    }
    console.log(`    ✓ ${Object.keys(deptNrToId).length} departments`);

    // =====================================================================
    //  4. DOCTORS (care_consultant_days → doctors, no users rows)
    //     Migrated doctors are historical data. user_id stays NULL.
    //     Personal info is stored directly on the doctors table.
    // =====================================================================
    console.log('👨‍⚕️  Importing doctors…');
    const consultIdToDocId = {};

    // Build procedure-type id → name map (care_procedure_type)
    const procedureTypeMap = {};
    for (const tokens of data['care_procedure_type']) {
      const r = toObj('care_procedure_type', tokens);
      if (r['id'] && r['procedure_type']) {
        procedureTypeMap[String(r['id'])] = String(clean(r['procedure_type'])).trim();
      }
    }

    for (const tokens of data['care_consultant_days']) {
      const r = toObj('care_consultant_days', tokens);
      if (r['name'] && r['name'].includes('`')) continue; // skip header row
      const { first, last } = splitName(r['name']);
      const deptId      = r['dept_nr'] ? (deptNrToId[r['dept_nr']] || null) : null;
      const isActive    = r['active'] !== '0';
      const licenseNum  = r['pid'] ? String(r['pid']).substring(0, 50) : null;
      const specialization = r['dept'] ? (procedureTypeMap[String(r['dept'])] || null) : null;
      const consultFee  = r['opd_cut'] ? parseFloat(r['opd_cut']) : null;
      const phone       = trunc(r['mobileno'], 20);

      try {
        const docRes = await client.query(
          `INSERT INTO doctors
             (user_id, first_name, last_name, phone, department_id,
              specialization, license_number, consultation_fee, is_active)
           VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (license_number) WHERE license_number IS NOT NULL
           DO UPDATE SET first_name = EXCLUDED.first_name, department_id = EXCLUDED.department_id
           RETURNING id`,
          [first.substring(0, 100), last.substring(0, 100), phone,
           deptId, specialization, licenseNum, consultFee, isActive],
        );

        if (r['id']) {
          consultIdToDocId[r['id']] = docRes.rows[0].id;
        }
      } catch (e) {
        errors.push(`doctor ${r['name']}: ${e.message}`);
      }
    }
    console.log(`    ✓ ${Object.keys(consultIdToDocId).length} doctors`);

    // =====================================================================
    //  5. LAB TEST CATALOG (care_test_group + care_test_param + billing prices)
    // =====================================================================
    console.log('🧪  Importing lab test catalog…');

    const billingPrices = {};
    for (const tokens of data['care_billing_item1']) {
      const r = toObj('care_billing_item1', tokens);
      if (r['item_code'] && !r['item_code'].includes('`') && r['item_unit_cost']) {
        billingPrices[r['item_code']] = parseFloat(r['item_unit_cost']) || null;
      }
    }

    const groupMap = {};
    for (const tokens of data['care_test_group']) {
      const r = toObj('care_test_group', tokens);
      if (r['group_id'] && !r['group_id'].includes('`')) groupMap[r['group_id']] = r['name'];
    }

    let labTestCount = 0;
    const testCodeToId = {};
    for (const tokens of data['care_test_param']) {
      const r = toObj('care_test_param', tokens);
      if (!r['name'] || r['name'].includes('`') || r['enabled'] === '0') continue;

      const category    = r['group_id'] ? (groupMap[r['group_id']] || r['group_id']) : 'General';
      const normalRange = [r['lo_bound'], r['hi_bound']].filter(Boolean).join(' - ') || r['median'] || null;
      const code        = r['id'] ? String(r['id']).substring(0, 50) : null;
      const price       = code ? (billingPrices[code] || null) : null;

      // Numeric bounds for interpretation:
      // Primary: lo_bound / hi_bound (mostly empty in this dump)
      // Fallback: lo_critical / hi_critical (critical alert values — more often set)
      // Last resort: parse simple "X - Y" or "X-Y" from median
      const parseNum = (v) => { const n = parseFloat(String(v || '').replace(/,/g, '')); return isNaN(n) ? null : n; };
      let loNum = parseNum(r['lo_bound']) ?? parseNum(r['lo_critical']);
      let hiNum = parseNum(r['hi_bound']) ?? parseNum(r['hi_critical']);
      if (loNum === null && hiNum === null && normalRange) {
        const m = String(normalRange).replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*[-\u2013]\s*(\d+(?:\.\d+)?)$/);
        if (m) { loNum = parseFloat(m[1]); hiNum = parseFloat(m[2]); }
      }

      try {
        const res = await client.query(
          `INSERT INTO lab_test_catalog (name, code, category, normal_range, lo_bound, hi_bound, unit, price, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = COALESCE(EXCLUDED.price, lab_test_catalog.price)
           RETURNING id`,
          [String(r['name']).substring(0, 200), code, String(category).substring(0, 100),
           normalRange, loNum, hiNum,
           trunc(r['msr_unit'], 50), price, true],
        );
        if (code) testCodeToId[code] = res.rows[0].id;
        labTestCount++;
      } catch (e) {
        errors.push(`lab test ${r['name']}: ${e.message}`);
      }
    }
    console.log(`    ✓ ${labTestCount} lab tests`);

    // =====================================================================
    //  9. RADIOLOGY TEST CATALOG (create defaults from modalities)
    // =====================================================================
    console.log('📡  Creating radiology test catalog…');
    const radioModalities = [
      { name: 'X-Ray',            code: 'XRAY',    modality: 'X-Ray' },
      { name: 'CT Scan',          code: 'CT',       modality: 'CT Scan' },
      { name: 'Ultrasound',       code: 'SONO',     modality: 'Ultrasound' },
      { name: 'Mammography',      code: 'MAMMO',    modality: 'Mammography' },
      { name: 'MRI',              code: 'MRI',      modality: 'MRI' },
      { name: 'Nuclear Medicine', code: 'NUCLEAR',  modality: 'Other' },
    ];
    const radioTestMap = {};
    for (const m of radioModalities) {
      const res = await client.query(
        `INSERT INTO radiology_test_catalog (name, code, modality, is_active)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (code) DO NOTHING
         RETURNING id`,
        [m.name, m.code, m.modality, true],
      );
      if (res.rows[0]) radioTestMap[m.code] = res.rows[0].id;
    }
    console.log(`    ✓ ${Object.keys(radioTestMap).length} radiology test types`);

    // =====================================================================
    //  10. INVENTORY ITEMS (from stockmaster)
    // =====================================================================
    console.log('💊  Importing inventory items…');
    const stockToItemId = {};
    let medCount = 0;
    for (const tokens of data['stockmaster']) {
      const r = toObj('stockmaster', tokens);
      if (!r['description'] || r['description'].includes('`')) continue;
      try {
        const res = await client.query(
          `INSERT INTO inventory_items
             (organization_id, name, generic_name, category, dosage_form, strength,
              unit, description, is_controlled, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            orgId,
            String(r['description']).substring(0, 200),
            String(r['description']).substring(0, 200),
            trunc(r['categoryid'], 100),
            trunc(r['units'], 50),
            r['strength'] ? trunc(r['strength'], 50) : null,
            trunc(r['units'], 20),
            r['longdescription'] || null,
            toBoolean(r['controlled']),
            !toBoolean(r['discontinued']),
          ],
        );
        if (res?.rows?.[0]) {
          const itemId = res.rows[0].id;
          if (r['stockid']) stockToItemId[r['stockid']] = itemId;

          const cost = parseFloat(r['actualcost'] || 0);
          if (cost > 0) {
            await client.query(
              `INSERT INTO inventory_transactions
                 (inventory_item_id, transaction_type, quantity, unit_price, notes, performed_by)
               VALUES ($1,'stock_in',1,$2,$3,$4)`,
              [itemId, cost, r['bin'] || null, adminUserId],
            );
          }
          medCount++;
        }
      } catch (e) {
        if (medCount < 5) errors.push(`stock ${r['stockid']}: ${e.message}`);
      }
    }
    console.log(`    ✓ ${medCount} inventory items`);

    // =====================================================================
    //  11. PATIENTS (from care_person)
    //      Match on cnic (CNIC = sss_nr field, 13 digits) where valid.
    //      Stores source_pid for full pid→patient_id mapping (lab history).
    //      Uses bulk INSERT in batches of 500 for speed.
    // =====================================================================
    console.log('🧑‍🤝‍🧑  Importing patients…');
    let patCount = 0, patSkipped = 0, patErrors = 0;
    // pid (parent) → our patients.id
    const personPidToPatientId = {};

    // Pre-collect all patients to insert
    const patientRows = [];   // { pid, firstName, lastName, phone, gender, dob, blood, address, marital, cnic, status }

    for (const tokens of data['care_person']) {
      const r = toObj('care_person', tokens);
      if (!r['pid'] || (r['name_first'] && r['name_first'].includes('`'))) continue;

      const firstName  = String(r['name_first'] || 'Unknown').trim().substring(0, 100);
      const lastName   = String(r['name_last']  || r['name_2'] || '-').trim().substring(0, 100);
      // CNICs in this system are stored in sss_nr (13-digit Pakistani CNIC)
      const cnic       = r['sss_nr'] && /^\d{13}$/.test(r['sss_nr']) ? r['sss_nr'] : null;
      const rawPhone   = r['cellphone_1_nr'] || r['phone_1_nr'] || '0000000000';
      const cleanPhone = String(rawPhone).replace(/[^0-9+]/g, '').substring(0, 20) || '0000000000';
      const dob        = isValidDate(r['date_birth']) ? r['date_birth'].substring(0, 10) : '1970-01-01';

      patientRows.push({
        pid:     r['pid'],
        firstName, lastName,
        phone:   cleanPhone,
        gender:  mapGender(r['sex']),
        dob,
        blood:   mapBloodGroup(r['blood_group']),
        address: r['addr_str'] || null,
        marital: mapMaritalStatus(r['civil_status']),
        cnic,
        status:  mapPatientStatus(r['status']),
      });
    }

    // Insert in batches of 500 using unnest for speed
    const BATCH = 500;
    for (let i = 0; i < patientRows.length; i += BATCH) {
      const batch = patientRows.slice(i, i + BATCH);

      // Build arrays for unnest
      const fns       = batch.map(p => p.firstName);
      const lns       = batch.map(p => p.lastName);
      const phones    = batch.map(p => p.phone);
      const genders   = batch.map(p => p.gender);
      const dobs      = batch.map(p => p.dob);
      const bloods    = batch.map(p => p.blood);
      const addresses = batch.map(p => p.address);
      const maritals  = batch.map(p => p.marital);
      const cnics     = batch.map(p => p.cnic);
      const statuses  = batch.map(p => p.status);
      const regBy     = batch.map(() => adminUserId);
      const pids      = batch.map(p => parseInt(p.pid) || null);

      try {
        const res = await client.query(
          `INSERT INTO patients
             (first_name, last_name, phone, gender, date_of_birth,
              blood_type, address, marital_status, cnic, status, registered_by, source_pid)
           SELECT * FROM UNNEST(
             $1::text[], $2::text[], $3::text[], $4::text[], $5::date[],
             $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::int[], $12::int[]
           )
           ON CONFLICT (cnic) WHERE cnic IS NOT NULL DO NOTHING
           RETURNING id`,
          [fns, lns, phones, genders, dobs, bloods, addresses, maritals, cnics, statuses, regBy, pids],
        );
        patCount += res.rowCount;
        // Build pid→patient_id map directly from RETURNING (fresh DB = no conflicts)
        res.rows.forEach((row, j) => {
          personPidToPatientId[batch[j].pid] = parseInt(row.id);
        });
      } catch (e) {
        patErrors++;
        errors.push(`patient batch i=${i}: ${e.message}`);
      }
    }

    // For any patients that had CNIC conflicts (re-run scenario), look them up by source_pid
    if (patErrors === 0 && Object.keys(personPidToPatientId).length < patientRows.length) {
      const existing = await _origQuery(`SELECT id, source_pid FROM patients WHERE source_pid IS NOT NULL`);
      for (const row of existing.rows) {
        if (row.source_pid) personPidToPatientId[String(row.source_pid)] = parseInt(row.id);
      }
    }
    patSkipped = patientRows.length - patCount - patErrors;
    console.log(`    ✓ ${patCount} patients inserted  (${patSkipped} skipped/duplicates, ${patErrors} errors)`);
    console.log(`    ✓ pid map size: ${Object.keys(personPidToPatientId).length}`);

    // =====================================================================
    //  12. ENCOUNTERS + LAB HISTORY
    //      care_encounter  →  encounter_nr ↔ pid
    //      care_test_findings  →  actual KEY:VALUE results
    //      care_test_request   →  which tests were ordered
    // =====================================================================
    console.log('🔬  Importing lab history…');

    // Build encounter_nr → patient pid lookup
    const encNrToPid = {};
    for (const tokens of data['care_encounter']) {
      const r = toObj('care_encounter', tokens);
      if (r['encounter_nr'] && r['pid']) encNrToPid[r['encounter_nr']] = r['pid'];
    }

    // Build test_request lookup: encounter_nr → first doctor
    const encNrToDoctor = {};
    for (const tokens of data['care_test_request']) {
      const r = toObj('care_test_request', tokens);
      if (r['encounter_nr'] && r['doctor'] && !encNrToDoctor[r['encounter_nr']]) {
        encNrToDoctor[r['encounter_nr']] = r['doctor'];
      }
    }

    // Group findings by encounter_nr
    const findingsByEnc = {};
    for (const tokens of data['care_test_findings']) {
      const r = toObj('care_test_findings', tokens);
      if (!r['encounter_nr'] || r['is_cancel'] === '1') continue;
      if (!r['serial_value'] || !r['serial_value'].includes(':')) continue;
      if (!findingsByEnc[r['encounter_nr']]) findingsByEnc[r['encounter_nr']] = [];
      findingsByEnc[r['encounter_nr']].push(r);
    }

    const fallbackDoctorRow = (await _origQuery('SELECT id FROM doctors LIMIT 1')).rows[0];
    let labOrderCount = 0, labResultCount = 0;

    if (!fallbackDoctorRow) {
      console.log('    ⚠️  No doctors found — skipping lab history');
    } else {
      let encErrors = 0;

      // Build encounter + order inserts in batches
      const encBatch   = { patIds: [], drIds: [], dates: [], notes: [] };
      const encNrOrder = []; // keep encounter_nr order to map back results

      for (const [encNr, findings] of Object.entries(findingsByEnc)) {
        const pid       = encNrToPid[encNr];
        const patientId = pid ? personPidToPatientId[pid] : null;
        if (!patientId) continue;

        const rawDr   = encNrToDoctor[encNr];
        const doctorId = rawDr ? (consultIdToDocId[rawDr] || fallbackDoctorRow.id) : fallbackDoctorRow.id;
        const encDate  = isValidDate(findings[0]['test_date']) ? findings[0]['test_date'] : new Date().toISOString();

        encBatch.patIds.push(patientId);
        encBatch.drIds.push(doctorId);
        encBatch.dates.push(encDate);
        encBatch.notes.push(`Historical ref:${encNr}`);
        encNrOrder.push(encNr);
      }

      // Bulk insert encounters
      let encIdMap = {}; // encNr → new encounter id
      if (encBatch.patIds.length > 0) {
        try {
          const encRes = await client.query(
            `INSERT INTO encounters (patient_id, doctor_id, encounter_date, encounter_type, status, assessment)
             SELECT unnest($1::int[]), unnest($2::int[]), unnest($3::timestamptz[]),
                    'outpatient', 'completed', unnest($4::text[])
             RETURNING id`,
            [encBatch.patIds, encBatch.drIds, encBatch.dates, encBatch.notes],
          );
          encRes.rows.forEach((row, idx) => {
            encIdMap[encNrOrder[idx]] = parseInt(row.id);
          });
        } catch (e) {
          encErrors++;
          errors.push(`bulk encounters: ${e.message}`);
        }
      }

      // Bulk insert lab orders
      const orderPatIds = [], orderDrIds = [], orderEncIds = [], orderDates = [], orderByIds = [];
      const orderEncNrList = [];
      for (const [encNr, encId] of Object.entries(encIdMap)) {
        const pid = encNrToPid[encNr];
        const patientId = pid ? personPidToPatientId[pid] : null;
        if (!patientId) continue;
        const rawDr = encNrToDoctor[encNr];
        const doctorId = rawDr ? (consultIdToDocId[rawDr] || fallbackDoctorRow.id) : fallbackDoctorRow.id;
        const encDate = findingsByEnc[encNr]?.[0]?.['test_date'] || new Date().toISOString();
        orderPatIds.push(patientId);
        orderDrIds.push(doctorId);
        orderEncIds.push(encId);
        orderDates.push(encDate);
        orderByIds.push(null); // ordered_by is nullable; migrated doctors have no users row
        orderEncNrList.push(encNr);
      }

      const encNrToOrderId = {};
      if (orderEncIds.length > 0) {
        try {
          const orderRes = await client.query(
            `INSERT INTO lab_orders (encounter_id, patient_id, doctor_id, ordered_by, status, order_date)
             SELECT unnest($1::int[]), unnest($2::int[]), unnest($3::int[]),
                    unnest($4::int[]), 'completed', unnest($5::timestamptz[])
             RETURNING id`,
            [orderEncIds, orderPatIds, orderDrIds, orderByIds, orderDates],
          );
          orderRes.rows.forEach((row, idx) => {
            encNrToOrderId[orderEncNrList[idx]] = parseInt(row.id);
            labOrderCount++;
          });
        } catch (e) {
          encErrors++;
          errors.push(`bulk lab_orders: ${e.message}`);
        }
      }

      // Insert lab_order_items in batches — parse KEY:VALUE pairs
      const itemOrderIds = [], itemTestIds = [], itemValues = [], itemDates = [];

      for (const [encNr, findings] of Object.entries(findingsByEnc)) {
        const orderId = encNrToOrderId[encNr];
        if (!orderId) continue;

        for (const finding of findings) {
          const pairs = String(finding['serial_value']).split('|');
          const resultDate = isValidDate(finding['test_date']) ? finding['test_date'] : new Date().toISOString();

          for (const pair of pairs) {
            const colonIdx = pair.indexOf(':');
            if (colonIdx === -1) continue;
            const testCode = pair.slice(0, colonIdx).trim().toUpperCase();
            const rawValue = pair.slice(colonIdx + 1).trim();
            if (!testCode || !rawValue) continue;

            const testId = testCodeToId[testCode];
            if (!testId) continue; // skip unknowns

            itemOrderIds.push(orderId);
            itemTestIds.push(testId);
            itemValues.push(rawValue.substring(0, 500));
            itemDates.push(resultDate);
            labResultCount++;
          }
        }
      }

      // Batch insert items in groups of 1000
      for (let i = 0; i < itemOrderIds.length; i += 1000) {
        const end = Math.min(i + 1000, itemOrderIds.length);
        try {
          await client.query(
            `INSERT INTO lab_order_items (lab_order_id, lab_test_id, status, result_value, result_date)
             SELECT unnest($1::int[]), unnest($2::int[]), 'completed', unnest($3::text[]), unnest($4::timestamptz[])`,
            [itemOrderIds.slice(i, end), itemTestIds.slice(i, end),
             itemValues.slice(i, end), itemDates.slice(i, end)],
          );
        } catch (e) {
          encErrors++;
          errors.push(`lab items batch i=${i}: ${e.message}`);
        }
      }

      console.log(`    ✓ ${labOrderCount} lab orders  |  ${labResultCount} result items  (${encErrors} errors)`);

      // ── Backfill unit + normal_range from catalog into items ───────────────
      console.log('    Backfilling unit / normal_range / interpretation on lab_order_items…');
      const backfillRes = await client.query(
        `UPDATE lab_order_items loi
         SET unit         = ltc.unit,
             normal_range = ltc.normal_range
         FROM lab_test_catalog ltc
         WHERE ltc.id = loi.lab_test_id
           AND (ltc.unit IS NOT NULL OR ltc.normal_range IS NOT NULL)`,
      );
      console.log(`    ✓ ${backfillRes.rowCount} items updated with unit/normal_range from catalog`);

      // ── Compute interpretation where lo_bound/hi_bound are available ───────
      const interpRes = await client.query(
        `UPDATE lab_order_items loi
         SET interpretation = CASE
           WHEN REGEXP_REPLACE(loi.result_value, '[^0-9.]', '', 'g') ~ '^\\d+(\\.\\d+)?$'
                AND CAST(REGEXP_REPLACE(loi.result_value, '[^0-9.]', '', 'g') AS DECIMAL)
                    < ltc.lo_bound                          THEN 'low'
           WHEN REGEXP_REPLACE(loi.result_value, '[^0-9.]', '', 'g') ~ '^\\d+(\\.\\d+)?$'
                AND CAST(REGEXP_REPLACE(loi.result_value, '[^0-9.]', '', 'g') AS DECIMAL)
                    > ltc.hi_bound                          THEN 'high'
           WHEN REGEXP_REPLACE(loi.result_value, '[^0-9.]', '', 'g') ~ '^\\d+(\\.\\d+)?$'
                                                            THEN 'normal'
           ELSE NULL
         END
         FROM lab_test_catalog ltc
         WHERE ltc.id = loi.lab_test_id
           AND ltc.lo_bound IS NOT NULL
           AND ltc.hi_bound IS NOT NULL
           AND loi.interpretation IS NULL`,
      );
      console.log(`    ✓ ${interpRes.rowCount} items given interpretation (low/normal/high)`);
    }

    // ── COMMIT ────────────────────────────────────────────────────────────────
    await client.query('COMMIT');

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n🎉  Migration complete!\n');
    console.log('Summary:');
    console.log(`  Organization:       Murshid Hospital (id=${orgId})`);
    console.log(`  Roles:              ${roleNames.length} (${roleNames.join(', ')})`);
    console.log(`  Admin User:         id=${adminUserId}`);
    console.log(`  Departments:        ${Object.keys(deptNrToId).length}`);
    console.log(`  Doctors:            ${Object.keys(consultIdToDocId).length}`);
    console.log(`  Patients:           ${patCount}  (${patSkipped} skipped/duplicates, ${patErrors} errors)`);
    console.log(`  Lab Tests:          ${labTestCount}`);
    console.log(`  Radiology Catalog:  ${Object.keys(radioTestMap).length}`);
    console.log(`  Inventory Items:    ${medCount}`);
    console.log(`  Lab Orders:         ${labOrderCount}`);
    console.log(`  Lab Result Items:   ${labResultCount}`);

    if (errors.length > 0) {
      console.log(`\n⚠️  First ${Math.min(errors.length, 20)} errors:`);
      errors.slice(0, 20).forEach((e) => console.log(`    • ${e}`));
    }
    console.log('');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌  Migration failed:', err.message);
    console.error(err.stack);
    if (errors.length > 0) {
      console.error('\nCollected errors:');
      errors.forEach((e) => console.error(`  • ${e}`));
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const filePath = process.argv[2] || '/Users/mikey/Downloads/Parent_DB.sql';
if (!fs.existsSync(filePath)) {
  console.error(`❌  File not found: ${filePath}`);
  process.exit(1);
}
migrate(path.resolve(filePath)).catch(() => process.exit(1));
