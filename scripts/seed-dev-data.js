#!/usr/bin/env node

'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in environment.');
  process.exit(1);
}

const SEED_PREFIX = process.env.SEED_PREFIX || 'seed20260520';
const SEED_PASSWORD = process.env.SEED_PASSWORD || 'Test@123';
const DOCTORS_COUNT = parseInt(process.env.SEED_DOCTORS || '10', 10);
const PATIENTS_COUNT = parseInt(process.env.SEED_PATIENTS || '50', 10);
const APPOINTMENTS_COUNT = parseInt(process.env.SEED_APPOINTMENTS || '120', 10);
const ENCOUNTERS_COUNT = parseInt(process.env.SEED_ENCOUNTERS || '60', 10);

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const firstNames = ['Ali','Sara','Hassan','Ayesha','Usman','Zara','Bilal','Noor','Hamza','Maryam','Omar','Fatima'];
const lastNames = ['Khan','Ahmed','Sheikh','Malik','Raza','Iqbal','Farooq','Hussain','Nadeem','Aziz','Khalid','Siddiqui'];
const specializations = ['Cardiology','Dermatology','Pediatrics','Orthopedics','Neurology','General Medicine','ENT','Ophthalmology'];
const complaints = ['Headache','Fever','Chest pain','Cough','Abdominal pain','Back pain','Joint pain','Skin rash'];
const assessments = ['Stable','Improving','Needs follow-up','Under observation'];
const plans = ['Prescribe meds','Order labs','Schedule follow-up','Lifestyle advice'];
const appointmentTypes = ['In-clinic Visit','Online Consultation'];
const genders = ['male','female','other'];
const bloodTypes = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
const statuses = ['scheduled','confirmed','in_progress','completed','cancelled','no_show'];
const noteTypes = ['progress','consultation','general'];
const times = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','14:00','14:30','15:00','15:30','16:00'];

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const pad2 = (n) => String(n).padStart(2, '0');

function formatDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function ensureRole(client, roleName) {
  const res = await client.query('SELECT id FROM roles WHERE name = $1 LIMIT 1', [roleName]);
  if (res.rows.length > 0) return res.rows[0].id;
  const ins = await client.query('INSERT INTO roles (name, permissions) VALUES ($1,$2) RETURNING id', [roleName, '[]']);
  return ins.rows[0].id;
}

async function ensureBranchAndDepartment(client) {
  const branchRes = await client.query('SELECT id FROM branches ORDER BY id LIMIT 1');
  if (branchRes.rows.length > 0) {
    const deptRes = await client.query('SELECT id FROM departments ORDER BY id LIMIT 1');
    return { branchId: branchRes.rows[0].id, departmentId: deptRes.rows[0]?.id ?? null };
  }

  const orgRes = await client.query(
    `INSERT INTO organizations (name, slug, category)
     VALUES ($1,$2,$3)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    ['Seed Hospital', `${SEED_PREFIX}-hospital`, 'hospital'],
  );
  const orgId = orgRes.rows[0].id;

  const branchInsert = await client.query(
    `INSERT INTO branches (organization_id, branch_seq, branch_code, name, location, phone, email)
     VALUES ($1,1,$2,$3,$4,$5,$6)
     ON CONFLICT (branch_code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [orgId, `${SEED_PREFIX}-BR-1`, 'Seed Branch 1', 'City Center', '0000000000', 'branch@seed.local'],
  );

  const deptRes = await client.query(
    `INSERT INTO departments (branch_id, name, description)
     VALUES ($1,$2,$3)
     ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
     RETURNING id`,
    [branchInsert.rows[0].id, 'General Medicine (Seed)', 'Seed department'],
  );

  return { branchId: branchInsert.rows[0].id, departmentId: deptRes.rows[0].id };
}

async function ensureNatureOfVisit(client) {
  const names = ['Consultation','Follow-up','Routine Check','Lab Review'];
  for (const name of names) {
    await client.query(
      `INSERT INTO nature_of_visit (name, description)
       VALUES ($1,$2)
       ON CONFLICT (name) DO NOTHING`,
      [name, `${name} visit`],
    );
  }
  const res = await client.query('SELECT id FROM nature_of_visit ORDER BY id');
  return res.rows.map(r => r.id);
}

async function ensureInventory(client, branchId) {
  const existing = await client.query('SELECT id FROM inventory_items ORDER BY id LIMIT 5');
  if (existing.rows.length > 0) return existing.rows.map(r => r.id);

  const items = [
    ['Paracetamol','Acetaminophen','Analgesic','Tablet','500mg','mg'],
    ['Ibuprofen','Ibuprofen','NSAID','Tablet','400mg','mg'],
    ['Amoxicillin','Amoxicillin','Antibiotic','Capsule','500mg','mg'],
    ['Cetirizine','Cetirizine','Antihistamine','Tablet','10mg','mg'],
    ['Omeprazole','Omeprazole','PPI','Capsule','20mg','mg'],
  ];

  const ids = [];
  for (const it of items) {
    const res = await client.query(
      `INSERT INTO inventory_items (branch_id, name, generic_name, category, dosage_form, strength, unit, quantity_available)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [branchId, it[0], it[1], it[2], it[3], it[4], it[5], randInt(50, 200)],
    );
    ids.push(res.rows[0].id);
  }
  return ids;
}

async function ensureLabTests(client, branchId) {
  const existing = await client.query('SELECT id FROM lab_test_catalog ORDER BY id LIMIT 5');
  if (existing.rows.length > 0) return existing.rows.map(r => r.id);

  const tests = [
    ['Complete Blood Count','CBC','Hematology'],
    ['Lipid Profile','LIP','Biochemistry'],
    ['Blood Glucose','GLU','Biochemistry'],
    ['CRP','CRP','Immunology'],
  ];

  const ids = [];
  for (const t of tests) {
    const res = await client.query(
      `INSERT INTO lab_test_catalog (branch_id, name, code, category, price)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [branchId, t[0], `${SEED_PREFIX}-${t[1]}`, t[2], randInt(500, 2500)],
    );
    ids.push(res.rows[0].id);
  }
  return ids;
}

async function ensureRadiologyTests(client, branchId) {
  const existing = await client.query('SELECT id FROM radiology_test_catalog ORDER BY id LIMIT 5');
  if (existing.rows.length > 0) return existing.rows.map(r => r.id);

  const tests = [
    ['Chest X-Ray','XRY','X-Ray'],
    ['CT Brain','CTB','CT Scan'],
    ['Abdominal Ultrasound','USG','Ultrasound'],
  ];

  const ids = [];
  for (const t of tests) {
    const res = await client.query(
      `INSERT INTO radiology_test_catalog (branch_id, name, code, modality, price)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [branchId, t[0], `${SEED_PREFIX}-${t[1]}`, t[2], randInt(1500, 6000)],
    );
    ids.push(res.rows[0].id);
  }
  return ids;
}

async function ensureUser(client, { roleId, email, firstName, lastName, phone, passwordHash }) {
  const res = await client.query(
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
    [roleId, firstName, lastName, email, passwordHash, phone],
  );
  return res.rows[0].id;
}

async function ensurePatient(client, userId, data) {
  const existing = await client.query('SELECT id FROM patients WHERE user_id = $1 LIMIT 1', [userId]);
  if (existing.rows.length > 0) return existing.rows[0].id;

  const res = await client.query(
    `INSERT INTO patients
      (user_id, first_name, last_name, email, phone, gender, date_of_birth, blood_type, address, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')
     RETURNING id`,
    [userId, data.firstName, data.lastName, data.email, data.phone, data.gender, data.dateOfBirth, data.bloodType, data.address],
  );
  return res.rows[0].id;
}

async function ensureDoctor(client, userId, data) {
  const res = await client.query(
    `INSERT INTO doctors
      (user_id, branch_id, department_id, first_name, last_name, email, phone, gender, date_of_birth,
       specialization, license_number, qualification, experience_years, consultation_fee, account_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active')
     ON CONFLICT (user_id) DO UPDATE SET
       branch_id = EXCLUDED.branch_id,
       department_id = EXCLUDED.department_id,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       specialization = EXCLUDED.specialization,
       account_status = 'active'
     RETURNING employee_id`,
    [
      userId,
      data.branchId,
      data.departmentId,
      data.firstName,
      data.lastName,
      data.email,
      data.phone,
      data.gender,
      data.dateOfBirth,
      data.specialization,
      data.licenseNumber,
      data.qualification,
      data.experienceYears,
      data.consultationFee,
    ],
  );
  return res.rows[0].employee_id;
}

async function main() {
  const client = await pool.connect();
  try {
    const doctorRoleId = await ensureRole(client, 'doctor');
    const patientRoleId = await ensureRole(client, 'patient');

    const { branchId, departmentId } = await ensureBranchAndDepartment(client);
    const natureIds = await ensureNatureOfVisit(client);
    const inventoryIds = await ensureInventory(client, branchId);
    const labTestIds = await ensureLabTests(client, branchId);
    const radiologyTestIds = await ensureRadiologyTests(client, branchId);

    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

    const doctors = [];
    for (let i = 1; i <= DOCTORS_COUNT; i++) {
      const firstName = pick(firstNames);
      const lastName = pick(lastNames);
      const email = `${SEED_PREFIX}.doctor${i}@example.com`;
      const phone = `03${randInt(100000000, 999999999)}`;
      const userId = await ensureUser(client, {
        roleId: doctorRoleId,
        email,
        firstName,
        lastName,
        phone,
        passwordHash,
      });

      await ensureDoctor(client, userId, {
        firstName,
        lastName,
        email,
        phone,
        gender: pick(genders),
        dateOfBirth: formatDate(addDays(new Date(), -randInt(9000, 16000))),
        specialization: pick(specializations),
        licenseNumber: `${SEED_PREFIX}-LIC-${i}`,
        qualification: 'MBBS',
        experienceYears: randInt(2, 20),
        consultationFee: randInt(500, 3000),
        branchId,
        departmentId,
      });

      doctors.push({ userId, branchId });
    }

    const patients = [];
    for (let i = 1; i <= PATIENTS_COUNT; i++) {
      const firstName = pick(firstNames);
      const lastName = pick(lastNames);
      const email = `${SEED_PREFIX}.patient${i}@example.com`;
      const phone = `03${randInt(100000000, 999999999)}`;
      const userId = await ensureUser(client, {
        roleId: patientRoleId,
        email,
        firstName,
        lastName,
        phone,
        passwordHash,
      });

      await ensurePatient(client, userId, {
        firstName,
        lastName,
        email,
        phone,
        gender: pick(genders),
        dateOfBirth: formatDate(addDays(new Date(), -randInt(7000, 20000))),
        bloodType: pick(bloodTypes),
        address: 'Seed Address',
      });

      patients.push({ userId });
    }

    const appointments = [];
    for (let i = 0; i < APPOINTMENTS_COUNT; i++) {
      const patient = pick(patients);
      const doctor = pick(doctors);
      const apptDate = formatDate(addDays(new Date(), randInt(-10, 20)));
      const apptTime = pick(times);
      const status = pick(statuses);
      const natureId = natureIds.length ? pick(natureIds) : null;

      const res = await client.query(
        `INSERT INTO appointments
          (patient_user_id, doctor_user_id, doctor_branch_id, appointment_date, appointment_time,
           duration_minutes, appointment_type, nature_of_visit_id, status, reason, notes, booked_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          patient.userId,
          doctor.userId,
          doctor.branchId,
          apptDate,
          apptTime,
          randInt(15, 45),
          pick(appointmentTypes),
          natureId,
          status,
          pick(complaints),
          `Seed appointment ${SEED_PREFIX}`,
          patient.userId,
        ],
      );

      appointments.push({
        id: res.rows[0].id,
        patient_user_id: patient.userId,
        doctor_user_id: doctor.userId,
        doctor_branch_id: doctor.branchId,
        appointment_date: apptDate,
      });
    }

    let encounterCount = 0;
    let labOrderCount = 0;
    let radiologyOrderCount = 0;
    let prescriptionCount = 0;
    let reportCount = 0;

    const encounterTargets = Math.min(ENCOUNTERS_COUNT, appointments.length);
    for (let i = 0; i < encounterTargets; i++) {
      const appt = appointments[i];
      const status = Math.random() > 0.4 ? 'completed' : 'in_progress';

      const encRes = await client.query(
        `INSERT INTO encounters
          (appointment_id, patient_user_id, doctor_user_id, encounter_type, chief_complaint,
           history_of_present_illness, physical_examination, assessment, plan, follow_up_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          appt.id,
          appt.patient_user_id,
          appt.doctor_user_id,
          'outpatient',
          pick(complaints),
          'Symptoms for several days',
          'Vitals stable',
          pick(assessments),
          pick(plans),
          formatDate(addDays(new Date(appt.appointment_date), randInt(3, 14))),
          status,
        ],
      );
      const encounterId = encRes.rows[0].id;
      encounterCount++;

      await client.query(
        `UPDATE appointments SET status = $1 WHERE id = $2`,
        [status, appt.id],
      );

      await client.query(
        `INSERT INTO vitals
          (encounter_id, patient_user_id, recorded_by, temperature, blood_pressure_systolic,
           blood_pressure_diastolic, heart_rate, respiratory_rate, oxygen_saturation, weight, height, bmi,
           blood_glucose, pain_scale, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          encounterId,
          appt.patient_user_id,
          appt.doctor_user_id,
          (36 + Math.random() * 1.5).toFixed(1),
          randInt(100, 140),
          randInt(60, 90),
          randInt(60, 100),
          randInt(12, 20),
          (95 + Math.random() * 4).toFixed(1),
          (50 + Math.random() * 30).toFixed(1),
          (150 + Math.random() * 30).toFixed(1),
          (18 + Math.random() * 6).toFixed(1),
          (80 + Math.random() * 40).toFixed(1),
          randInt(1, 6),
          'Seed vitals',
        ],
      );

      await client.query(
        `INSERT INTO diagnoses
          (encounter_id, patient_user_id, doctor_user_id, icd_code, diagnosis_text, diagnosis_type, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          encounterId,
          appt.patient_user_id,
          appt.doctor_user_id,
          'R51',
          pick(complaints),
          'primary',
          status === 'completed' ? 'resolved' : 'active',
          'Seed diagnosis',
        ],
      );

      await client.query(
        `INSERT INTO clinical_notes (encounter_id, doctor_id, note_type, content, is_signed)
         VALUES ($1,$2,$3,$4,$5)`,
        [encounterId, appt.doctor_user_id, pick(noteTypes), 'Seed clinical note', true],
      );

      const prescRes = await client.query(
        `INSERT INTO prescriptions
          (encounter_id, patient_user_id, doctor_user_id, valid_until, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [
          encounterId,
          appt.patient_user_id,
          appt.doctor_user_id,
          formatDate(addDays(new Date(), 7)),
          status === 'completed' ? 'dispensed' : 'active',
          'Seed prescription',
        ],
      );
      prescriptionCount++;

      const itemId = inventoryIds.length ? pick(inventoryIds) : null;
      await client.query(
        `INSERT INTO prescription_items
          (prescription_id, inventory_item_id, medication_name, dosage, frequency, duration, quantity, route, instructions)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          prescRes.rows[0].id,
          itemId,
          'Paracetamol',
          '500mg',
          'BID',
          '3 days',
          6,
          'oral',
          'After meals',
        ],
      );

      if (labTestIds.length && Math.random() > 0.3) {
        const labRes = await client.query(
          `INSERT INTO lab_orders
            (encounter_id, patient_user_id, doctor_user_id, doctor_branch_id, ordered_by, priority, status, clinical_notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING id`,
          [
            encounterId,
            appt.patient_user_id,
            appt.doctor_user_id,
            appt.doctor_branch_id,
            appt.doctor_user_id,
            'routine',
            status === 'completed' ? 'completed' : 'ordered',
            'Seed lab order',
          ],
        );
        labOrderCount++;

        const testId = pick(labTestIds);
        await client.query(
          `INSERT INTO lab_order_items
            (lab_order_id, lab_test_id, status, result_value, unit, interpretation)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            labRes.rows[0].id,
            testId,
            status === 'completed' ? 'completed' : 'pending',
            status === 'completed' ? 'Normal' : null,
            null,
            status === 'completed' ? 'normal' : null,
          ],
        );

        if (Math.random() > 0.5) {
          await client.query(
            `INSERT INTO medical_reports
              (report_type, encounter_id, lab_order_id, patient_user_id, doctor_user_id, title, summary, report_date, status, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              'lab',
              encounterId,
              labRes.rows[0].id,
              appt.patient_user_id,
              appt.doctor_user_id,
              'Seed Lab Report',
              'Basic lab report summary',
              formatDate(new Date()),
              'final',
              appt.doctor_user_id,
            ],
          );
          reportCount++;
        }
      }

      if (radiologyTestIds.length && Math.random() > 0.4) {
        const radRes = await client.query(
          `INSERT INTO radiology_orders
            (encounter_id, patient_user_id, doctor_user_id, branch_id, ordered_by, priority, status, clinical_notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING id`,
          [
            encounterId,
            appt.patient_user_id,
            appt.doctor_user_id,
            appt.doctor_branch_id,
            appt.doctor_user_id,
            'routine',
            status === 'completed' ? 'completed' : 'ordered',
            'Seed radiology order',
          ],
        );
        radiologyOrderCount++;

        const testId = pick(radiologyTestIds);
        await client.query(
          `INSERT INTO radiology_order_items
            (radiology_order_id, radiology_test_id, status, findings, impression)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            radRes.rows[0].id,
            testId,
            status === 'completed' ? 'completed' : 'ordered',
            status === 'completed' ? 'Unremarkable' : null,
            status === 'completed' ? 'Normal study' : null,
          ],
        );

        if (Math.random() > 0.5) {
          await client.query(
            `INSERT INTO medical_reports
              (report_type, encounter_id, radiology_order_id, patient_user_id, doctor_user_id, title, summary, report_date, status, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              'radiology',
              encounterId,
              radRes.rows[0].id,
              appt.patient_user_id,
              appt.doctor_user_id,
              'Seed Radiology Report',
              'Basic radiology report summary',
              formatDate(new Date()),
              'final',
              appt.doctor_user_id,
            ],
          );
          reportCount++;
        }
      }
    }

    console.log('Seed complete.');
    console.log(`Doctors: ${DOCTORS_COUNT}`);
    console.log(`Patients: ${PATIENTS_COUNT}`);
    console.log(`Appointments: ${appointments.length}`);
    console.log(`Encounters: ${encounterCount}`);
    console.log(`Prescriptions: ${prescriptionCount}`);
    console.log(`Lab orders: ${labOrderCount}`);
    console.log(`Radiology orders: ${radiologyOrderCount}`);
    console.log(`Reports: ${reportCount}`);
    console.log(`Login password for seed users: ${SEED_PASSWORD}`);
    console.log(`Email format: ${SEED_PREFIX}.doctorN@example.com / ${SEED_PREFIX}.patientN@example.com`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
