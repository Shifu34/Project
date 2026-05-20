/**
 * seed-healix-org.js
 *
 * Creates a fully wired test organization "Healix Medical Center":
 *   - 1 Organization
 *   - 1 Branch
 *   - 1 org_admin user     → org.healix@healix.com / Test@1234
 *   - 1 branch_admin user  → branch.healix@healix.com / Test@1234
 *   - 3 Departments
 *   - 3 Doctors (with schedules)
 *   - 5 Patients
 *   - Lab test catalog entries (linked to branch)
 *   - Radiology test catalog entries (linked to branch)
 *   - Pharmacy inventory items
 *   - 6 Appointments (mix of statuses)
 *   - 3 Encounters with vitals, diagnoses, prescriptions, lab orders, radiology orders
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const PASS = 'Test@1234';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hash = await bcrypt.hash(PASS, 12);

    // ── 1. Organization ──────────────────────────────────────────────────────
    const orgRes = await client.query(`
      INSERT INTO organizations (name, slug, address, phone, email, category, is_active)
      VALUES ('Healix Medical Center', 'healix-medical', '123 Health Street, Karachi', '+92-21-1234567', 'contact@healix-medical.com', 'hospital', true)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name
    `);
    const org = orgRes.rows[0];
    console.log(`✓ Organization: ${org.name} (id=${org.id})`);

    // ── 2. Branch ────────────────────────────────────────────────────────────
    const branchRes = await client.query(`
      INSERT INTO branches (organization_id, branch_seq, branch_code, name, location, phone, email, is_active)
      VALUES ($1, 1, 'HMC-001', 'Healix Main Branch', 'Clifton, Karachi', '+92-21-1234567', 'main@healix-medical.com', true)
      ON CONFLICT (branch_code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name
    `, [org.id]);
    const branch = branchRes.rows[0];
    console.log(`✓ Branch: ${branch.name} (id=${branch.id})`);

    // ── 3. Roles lookup ──────────────────────────────────────────────────────
    const roles = {};
    for (const name of ['org_admin','branch_admin','doctor','patient']) {
      const r = await client.query(`SELECT id FROM roles WHERE name = $1`, [name]);
      if (!r.rows[0]) throw new Error(`Role '${name}' not found — run migrate-roles.js first`);
      roles[name] = r.rows[0].id;
    }

    // ── 4. Org Admin ─────────────────────────────────────────────────────────
    const orgAdminRes = await client.query(`
      INSERT INTO users (role_id, first_name, last_name, email, password_hash, organization_id, is_active)
      VALUES ($1, 'Healix', 'OrgAdmin', 'org.healix@healix.com', $2, $3, true)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        organization_id = EXCLUDED.organization_id
      RETURNING id, email
    `, [roles.org_admin, hash, org.id]);
    const orgAdmin = orgAdminRes.rows[0];
    console.log(`✓ Org Admin: ${orgAdmin.email} (id=${orgAdmin.id})`);

    // ── 5. Branch Admin ──────────────────────────────────────────────────────
    const branchAdminRes = await client.query(`
      INSERT INTO users (role_id, first_name, last_name, email, password_hash, organization_id, branch_id, is_active)
      VALUES ($1, 'Healix', 'BranchAdmin', 'branch.healix@healix.com', $2, $3, $4, true)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        organization_id = EXCLUDED.organization_id,
        branch_id = EXCLUDED.branch_id
      RETURNING id, email
    `, [roles.branch_admin, hash, org.id, branch.id]);
    const branchAdmin = branchAdminRes.rows[0];
    console.log(`✓ Branch Admin: ${branchAdmin.email} (id=${branchAdmin.id})`);

    // ── 6. Departments ───────────────────────────────────────────────────────
    const deptData = [
      { name: 'General Medicine', description: 'Primary care and general consultations' },
      { name: 'Cardiology',       description: 'Heart and cardiovascular care' },
      { name: 'Orthopedics',      description: 'Bone, joint and muscle care' },
    ];
    const deptIds = [];
    for (const d of deptData) {
      const r = await client.query(`
        INSERT INTO departments (branch_id, name, description, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
        RETURNING id
      `, [branch.id, d.name, d.description]);
      deptIds.push(r.rows[0].id);
    }
    console.log(`✓ Departments: ${deptData.map(d => d.name).join(', ')}`);

    // ── 7. Doctors ───────────────────────────────────────────────────────────
    const doctorData = [
      { first: 'Hamza',   last: 'Siddiqui', email: 'dr.ahmed.healix@healix.com',  spec: 'General Physician',  dept: deptIds[0], fee: 1500 },
      { first: 'Nadia',   last: 'Baig',     email: 'dr.sara.healix@healix.com',   spec: 'Cardiologist',       dept: deptIds[1], fee: 3000 },
      { first: 'Tariq',   last: 'Mehmood',  email: 'dr.usman.healix@healix.com',  spec: 'Orthopedic Surgeon', dept: deptIds[2], fee: 2500 },
    ];

    const doctors = [];
    for (const d of doctorData) {
      // Create user account
      const uRes = await client.query(`
        INSERT INTO users (role_id, first_name, last_name, email, password_hash, is_active)
        VALUES ($1, $2, $3, $4, $5, true)
        ON CONFLICT (email) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          password_hash = EXCLUDED.password_hash
        RETURNING id
      `, [roles.doctor, d.first, d.last, d.email, hash]);
      const userId = uRes.rows[0].id;

      // Create doctor record
      const docRes = await client.query(`
        INSERT INTO doctors (user_id, branch_id, department_id, first_name, last_name, email,
          specialization, consultation_fee, account_status, is_active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',true)
        ON CONFLICT (user_id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          branch_id = EXCLUDED.branch_id,
          specialization = EXCLUDED.specialization,
          consultation_fee = EXCLUDED.consultation_fee,
          account_status = 'active'
        RETURNING employee_id, branch_id
      `, [userId, branch.id, d.dept, d.first, d.last, d.email, d.spec, d.fee]);

      doctors.push({ userId, employeeId: docRes.rows[0].employee_id, branchId: branch.id, ...d });

      // Schedules: Mon–Fri 09:00–17:00
      const days = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
      for (const day of days) {
        await client.query(`
          INSERT INTO doctor_schedules (doctor_user_id, doctor_branch_id, day_of_week, appointment_type, start_time, end_time, max_appointments, is_available)
          VALUES ($1,$2,$3,'Online Consultation','09:00','17:00',20,true)
          ON CONFLICT DO NOTHING
        `, [userId, branch.id, day]);
      }
    }
    console.log(`✓ Doctors: ${doctorData.map(d => `Dr. ${d.first} ${d.last} (${d.spec})`).join(', ')}`);  

    // ── 8. Patients ──────────────────────────────────────────────────────────
    const patientData = [
      { first: 'Ali',      last: 'Hassan',  email: 'ali.healix@test.com',      phone: '0300-1111001', dob: '1990-03-15', gender: 'male' },
      { first: 'Fatima',   last: 'Raza',    email: 'fatima.healix@test.com',   phone: '0300-1111002', dob: '1985-07-22', gender: 'female' },
      { first: 'Bilal',    last: 'Ahmed',   email: 'bilal.healix@test.com',    phone: '0300-1111003', dob: '1995-11-05', gender: 'male' },
      { first: 'Zainab',   last: 'Qureshi', email: 'zainab.healix@test.com',   phone: '0300-1111004', dob: '1992-01-30', gender: 'female' },
      { first: 'Omar',     last: 'Farooq',  email: 'omar.healix@test.com',     phone: '0300-1111005', dob: '1988-09-12', gender: 'male' },
    ];

    const patients = [];
    for (const p of patientData) {
      const uRes = await client.query(`
        INSERT INTO users (role_id, first_name, last_name, email, password_hash, phone, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
        RETURNING id
      `, [roles.patient, p.first, p.last, p.email, hash, p.phone]);
      const userId = uRes.rows[0].id;

      const patRes = await client.query(`
        INSERT INTO patients (user_id, first_name, last_name, email, phone, gender, date_of_birth)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING id
      `, [userId, p.first, p.last, p.email, p.phone, p.gender, p.dob]);

      patients.push({ userId, patientId: patRes.rows[0].id, ...p });
    }
    console.log(`✓ Patients: ${patientData.map(p => `${p.first} ${p.last}`).join(', ')}`);

    // ── 9. Lab Test Catalog ──────────────────────────────────────────────────
    const labTests = [
      { name: 'Complete Blood Count',      code: 'HMC-CBC-001',  category: 'Hematology',    price: 800  },
      { name: 'Blood Glucose Fasting',     code: 'HMC-BG-001',   category: 'Biochemistry',  price: 500  },
      { name: 'Lipid Profile',             code: 'HMC-LP-001',   category: 'Biochemistry',  price: 1200 },
      { name: 'Liver Function Tests',      code: 'HMC-LFT-001',  category: 'Biochemistry',  price: 1500 },
      { name: 'Kidney Function Tests',     code: 'HMC-KFT-001',  category: 'Biochemistry',  price: 1400 },
      { name: 'Thyroid Profile (T3/T4)',   code: 'HMC-TH-001',   category: 'Endocrinology', price: 2000 },
      { name: 'Urine Complete Examination',code: 'HMC-UCE-001',  category: 'Urinalysis',    price: 400  },
      { name: 'HbA1c',                     code: 'HMC-HBA-001',  category: 'Biochemistry',  price: 1600 },
    ];

    const labTestIds = [];
    for (const t of labTests) {
      const r = await client.query(`
        INSERT INTO lab_test_catalog (branch_id, name, code, category, price, is_active)
        VALUES ($1,$2,$3,$4,$5,true)
        ON CONFLICT (code) DO UPDATE SET price = EXCLUDED.price
        RETURNING id
      `, [branch.id, t.name, t.code, t.category, t.price]);
      labTestIds.push(r.rows[0].id);
    }
    console.log(`✓ Lab tests: ${labTests.length} entries`);

    // ── 10. Radiology Test Catalog ───────────────────────────────────────────
    const radTests = [
      { name: 'Chest X-Ray',              code: 'HMC-XR-CHEST',  modality: 'X-Ray',     price: 1200 },
      { name: 'X-Ray Knee (AP/Lateral)',  code: 'HMC-XR-KNEE',   modality: 'X-Ray',     price: 1500 },
      { name: 'ECG / EKG',               code: 'HMC-ECG-001',   modality: 'Other',     price: 600  },
      { name: 'Echocardiogram',           code: 'HMC-ECHO-001',  modality: 'Ultrasound',price: 4500 },
      { name: 'Abdominal Ultrasound',     code: 'HMC-US-ABD',    modality: 'Ultrasound',price: 2000 },
      { name: 'CT Scan Head',             code: 'HMC-CT-HEAD',   modality: 'CT Scan',   price: 8000 },
      { name: 'MRI Lumbar Spine',         code: 'HMC-MRI-LS',    modality: 'MRI',       price: 12000},
    ];

    const radTestIds = [];
    for (const t of radTests) {
      const r = await client.query(`
        INSERT INTO radiology_test_catalog (branch_id, name, code, modality, price, is_active)
        VALUES ($1,$2,$3,$4,$5,true)
        ON CONFLICT (code) DO UPDATE SET price = EXCLUDED.price
        RETURNING id
      `, [branch.id, t.name, t.code, t.modality, t.price]);
      radTestIds.push(r.rows[0].id);
    }
    console.log(`✓ Radiology tests: ${radTests.length} entries`);

    // ── 11. Pharmacy Inventory ───────────────────────────────────────────────
    const meds = [
      { name: 'Paracetamol 500mg',      generic: 'Paracetamol',    category: 'Analgesic',    qty: 500, price: 5 },
      { name: 'Amoxicillin 500mg',      generic: 'Amoxicillin',    category: 'Antibiotic',   qty: 200, price: 15 },
      { name: 'Metformin 500mg',        generic: 'Metformin',      category: 'Antidiabetic', qty: 300, price: 8 },
      { name: 'Atorvastatin 20mg',      generic: 'Atorvastatin',   category: 'Statin',       qty: 150, price: 22 },
      { name: 'Omeprazole 20mg',        generic: 'Omeprazole',     category: 'PPI',          qty: 200, price: 12 },
      { name: 'Amlodipine 5mg',         generic: 'Amlodipine',     category: 'CCB',          qty: 180, price: 10 },
      { name: 'Ibuprofen 400mg',        generic: 'Ibuprofen',      category: 'NSAID',        qty: 300, price: 7  },
    ];

    const invItemIds = [];
    for (const m of meds) {
      const r = await client.query(`
        INSERT INTO inventory_items (branch_id, name, generic_name, category, dosage_form, quantity_available, is_active)
        VALUES ($1,$2,$3,$4,'tablet',$5,true)
        RETURNING id
      `, [branch.id, m.name, m.generic, m.category, m.qty]);
      invItemIds.push(r.rows[0].id);
    }
    console.log(`✓ Pharmacy inventory: ${meds.length} items`);

    // ── 12. Appointments ─────────────────────────────────────────────────────
    const today   = new Date();
    const fmtDate = (d) => d.toISOString().split('T')[0];
    const futureDate = (days) => { const d = new Date(today); d.setDate(d.getDate() + days); return fmtDate(d); };
    const pastDate   = (days) => { const d = new Date(today); d.setDate(d.getDate() - days); return fmtDate(d); };

    const apptDefs = [
      // patient idx, doctor idx, date, time, status
      { pi: 0, di: 0, date: pastDate(3),   time: '10:00', status: 'completed' },
      { pi: 1, di: 1, date: pastDate(1),   time: '14:00', status: 'completed' },
      { pi: 2, di: 2, date: pastDate(5),   time: '11:00', status: 'completed' },
      { pi: 3, di: 0, date: futureDate(1), time: '09:00', status: 'confirmed' },
      { pi: 4, di: 1, date: futureDate(2), time: '15:00', status: 'scheduled' },
      { pi: 0, di: 2, date: futureDate(3), time: '11:30', status: 'scheduled' },
    ];

    const apptIds = [];
    for (const a of apptDefs) {
      const r = await client.query(`
        INSERT INTO appointments
          (patient_user_id, doctor_user_id, doctor_branch_id, appointment_date, appointment_time, appointment_type, status)
        VALUES ($1,$2,$3,$4,$5,'Online Consultation',$6)
        RETURNING id
      `, [patients[a.pi].userId, doctors[a.di].userId, branch.id, a.date, a.time, a.status]);
      apptIds.push({ id: r.rows[0].id, ...a });
    }
    console.log(`✓ Appointments: ${apptIds.length} created`);

    // Add payments for completed appointments
    for (const a of apptIds.filter(a => a.status === 'completed')) {
      const doctor = doctors[a.di];
      await client.query(`
        INSERT INTO payments (appointment_id, patient_user_id, amount, payment_method, payment_status, paid_at)
        VALUES ($1,$2,$3,'online','completed', NOW())
      `, [a.id, patients[a.pi].userId, doctor.fee]);
    }
    console.log(`✓ Payments: ${apptIds.filter(a => a.status === 'completed').length} payments recorded`);

    // ── 13. Encounters + Clinical data ───────────────────────────────────────
    const completedAppts = apptIds.filter(a => a.status === 'completed');
    const encIds = [];

    for (let i = 0; i < completedAppts.length; i++) {
      const a   = completedAppts[i];
      const doc = doctors[a.di];
      const pat = patients[a.pi];

      const encRes = await client.query(`
        INSERT INTO encounters
          (appointment_id, patient_user_id, doctor_user_id, encounter_type,
           chief_complaint, history_of_present_illness, physical_examination,
           assessment, plan, follow_up_date, status)
        VALUES ($1,$2,$3,'outpatient',$4,$5,'Vitals stable, examination normal',$6,$7, $8, 'completed')
        RETURNING id
      `, [
        a.id, pat.userId, doc.userId,
        ['Headache and fatigue', 'Chest tightness', 'Knee pain and swelling'][i],
        ['2-3 days of intermittent headache', 'Shortness of breath on exertion', 'After a fall last week'][i],
        ['Tension headache, rule out hypertension', 'Possible angina, rule out cardiac cause', 'Traumatic knee injury'][i],
        ['Rest, hydration, and analgesia', 'Cardiology workup and lifestyle changes', 'RICE therapy and physiotherapy'][i],
        futureDate(14),
      ]);
      const encId = encRes.rows[0].id;
      encIds.push(encId);

      // Vitals
      await client.query(`
        INSERT INTO vitals
          (encounter_id, patient_user_id, recorded_by,
           temperature, blood_pressure_systolic, blood_pressure_diastolic,
           heart_rate, respiratory_rate, oxygen_saturation, weight, height, bmi, pain_scale)
        VALUES ($1,$2,$3, 37.0, ${118 + i*4}, ${75 + i*2}, ${72 + i*3}, 16, 98.0, ${65 + i*5}, 170, 22.5, ${i * 2 + 2})
      `, [encId, pat.userId, doc.userId]);

      // Diagnoses
      const icdCodes = [['R51','Headache'], ['R07.9','Chest pain'], ['M79.3','Knee pain']];
      await client.query(`
        INSERT INTO diagnoses (encounter_id, patient_user_id, doctor_user_id, icd_code, diagnosis_text, diagnosis_type, status)
        VALUES ($1,$2,$3,$4,$5,'primary','active')
      `, [encId, pat.userId, doc.userId, icdCodes[i][0], icdCodes[i][1]]);

      // Prescription
      const presRes = await client.query(`
        INSERT INTO prescriptions (encounter_id, patient_user_id, doctor_user_id, valid_until, status, notes)
        VALUES ($1,$2,$3, $4, 'active', 'Take as prescribed')
        RETURNING id
      `, [encId, pat.userId, doc.userId, futureDate(30)]);
      const presId = presRes.rows[0].id;

      // Prescription items
      const rxItems = [
        [invItemIds[0], 'Paracetamol 500mg', '500mg', 'TID', '5 days', 15, 'oral'],
        [invItemIds[3], 'Atorvastatin 20mg', '20mg',  'OD',  '30 days', 30, 'oral'],
        [invItemIds[6], 'Ibuprofen 400mg',   '400mg', 'BID', '7 days', 14, 'oral'],
      ];
      const rx = rxItems[i];
      await client.query(`
        INSERT INTO prescription_items (prescription_id, inventory_item_id, medication_name, dosage, frequency, duration, quantity, route)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [presId, rx[0], rx[1], rx[2], rx[3], rx[4], rx[5], rx[6]]);

      // Lab order (use first 2 lab tests for each encounter)
      const labOrderRes = await client.query(`
        INSERT INTO lab_orders
          (encounter_id, patient_user_id, doctor_user_id, doctor_branch_id, ordered_by, priority, clinical_notes)
        VALUES ($1,$2,$3,$4,$5,'routine','Routine workup')
        RETURNING id
      `, [encId, pat.userId, doc.userId, branch.id, doc.userId]);
      const labOrderId = labOrderRes.rows[0].id;
      for (const tid of [labTestIds[0], labTestIds[1]]) {
        await client.query(`
          INSERT INTO lab_order_items (lab_order_id, lab_test_id) VALUES ($1,$2)
        `, [labOrderId, tid]);
      }

      // Radiology order (use first rad test per encounter)
      const radOrderRes = await client.query(`
        INSERT INTO radiology_orders
          (encounter_id, patient_user_id, doctor_user_id, branch_id, ordered_by, priority, clinical_notes)
        VALUES ($1,$2,$3,$4,$5,'routine','Imaging as indicated')
        RETURNING id
      `, [encId, pat.userId, doc.userId, branch.id, doc.userId]);
      const radOrderId = radOrderRes.rows[0].id;
      await client.query(`
        INSERT INTO radiology_order_items (radiology_order_id, radiology_test_id) VALUES ($1,$2)
      `, [radOrderId, radTestIds[i]]);

      // Clinical note
      await client.query(`
        INSERT INTO clinical_notes (encounter_id, doctor_id, note_type, content, is_signed)
        VALUES ($1,$2,'progress',$3,true)
      `, [encId, doc.userId, `Patient presents with ${['headache', 'chest tightness', 'knee pain'][i]}. Examination and vitals reviewed. Treatment plan initiated.`]);
    }
    console.log(`✓ Encounters: ${encIds.length} with vitals, diagnoses, prescriptions, labs, radiology`);

    await client.query('COMMIT');

    console.log('\n✅ Healix Medical Center seeded successfully!\n');
    console.log('── Credentials (password: Test@1234 for all) ──────────────────');
    console.log(`  Org Admin    : org.healix@healix.com`);
    console.log(`  Branch Admin : branch.healix@healix.com`);
    console.log(`  Doctor 1     : dr.ahmed.healix@healix.com   (General Physician)`);
    console.log(`  Doctor 2     : dr.sara.healix@healix.com    (Cardiologist)`);
    console.log(`  Doctor 3     : dr.usman.healix@healix.com   (Orthopedic Surgeon)`);
    console.log(`  Patient 1    : ali.healix@test.com`);
    console.log(`  Patient 2    : fatima.healix@test.com`);
    console.log(`  Patient 3    : bilal.healix@test.com`);
    console.log(`  Patient 4    : zainab.healix@test.com`);
    console.log(`  Patient 5    : omar.healix@test.com`);
    console.log('\n── IDs ────────────────────────────────────────────────────────');
    console.log(`  Organization : id=${org.id}`);
    console.log(`  Branch       : id=${branch.id}`);
    console.log(`  Lab tests    : ids=${labTestIds.join(',')}`);
    console.log(`  Rad tests    : ids=${radTestIds.join(',')}`);
    console.log(`  Inv items    : ids=${invItemIds.join(',')}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Seeding failed:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
