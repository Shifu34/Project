require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'murshid_hospital',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

(async () => {
  const c = await pool.connect();

  const tables = [
    'organizations','roles','users','user_profiles','patients',
    'insurance_providers','user_insurances','departments','doctors',
    'doctor_schedules','appointments','payments','payment_refunds',
    'encounters','diagnoses','clinical_notes','vitals',
    'prescriptions','prescription_items','inventory_items','inventory_transactions',
    'lab_test_catalog','lab_orders','lab_order_items',
    'radiology_test_catalog','radiology_orders','radiology_order_items',
    'subscription_plans','user_subscriptions','ai_sessions','ai_outputs',
    'ai_transcripts','notifications','audit_logs'
  ];

  console.log('=== ROW COUNTS ===');
  for (const t of tables) {
    const r = await c.query(`SELECT COUNT(*) as cnt FROM ${t}`);
    const cnt = r.rows[0].cnt;
    if (parseInt(cnt) > 0) console.log(`  ${t.padEnd(30)} ${cnt}`);
  }

  console.log('\n=== ROLES ===');
  const roles = await c.query('SELECT * FROM roles ORDER BY id');
  roles.rows.forEach(r => console.log(`  id=${r.id} name=${r.name}`));

  console.log('\n=== DEPARTMENTS (first 10) ===');
  const depts = await c.query('SELECT id, name, is_active FROM departments ORDER BY id LIMIT 10');
  depts.rows.forEach(r => console.log(`  id=${r.id} ${r.name}${r.is_active ? '' : ' [INACTIVE]'}`));

  console.log('\n=== DOCTORS (first 5) ===');
  const docs = await c.query(`SELECT d.id, u.first_name, u.last_name, d.specialization, dep.name as dept_name
    FROM doctors d JOIN users u ON d.user_id=u.id LEFT JOIN departments dep ON d.department_id=dep.id ORDER BY d.id LIMIT 5`);
  docs.rows.forEach(r => console.log(`  id=${r.id} ${r.first_name} ${r.last_name} spec=${r.specialization} dept=${r.dept_name}`));

  console.log('\n=== LAB TESTS (first 10) ===');
  const labs = await c.query('SELECT id, name, code, category, price FROM lab_test_catalog ORDER BY id LIMIT 10');
  labs.rows.forEach(r => console.log(`  id=${r.id} [${r.code}] ${r.name} cat=${r.category} price=${r.price}`));

  console.log('\n=== INVENTORY (first 5) ===');
  const inv = await c.query('SELECT id, name, category, dosage_form, strength FROM inventory_items ORDER BY id LIMIT 5');
  inv.rows.forEach(r => console.log(`  id=${r.id} ${r.name} cat=${r.category} form=${r.dosage_form}`));

  console.log('\n=== RADIOLOGY CATALOG ===');
  const rad = await c.query('SELECT * FROM radiology_test_catalog ORDER BY id');
  rad.rows.forEach(r => console.log(`  id=${r.id} ${r.name} code=${r.code} mod=${r.modality}`));

  console.log('\n=== PATIENTS (first 5) ===');
  const pats = await c.query('SELECT id, patient_code, first_name, last_name, phone, gender FROM patients ORDER BY id LIMIT 5');
  pats.rows.forEach(r => console.log(`  id=${r.id} ${r.patient_code} ${r.first_name} ${r.last_name} ${r.gender} ph=${r.phone}`));

  console.log('\n=== ENCOUNTERS (first 5) ===');
  const enc = await c.query('SELECT id, patient_id, doctor_id, encounter_type, status FROM encounters ORDER BY id LIMIT 5');
  enc.rows.forEach(r => console.log(`  id=${r.id} pat=${r.patient_id} doc=${r.doctor_id} ${r.encounter_type} ${r.status}`));

  console.log('\n=== INSURANCE (first 5) ===');
  const ins = await c.query('SELECT id, name, contact_phone FROM insurance_providers ORDER BY id LIMIT 5');
  ins.rows.forEach(r => console.log(`  id=${r.id} ${r.name} ph=${r.contact_phone}`));

  c.release();
  await pool.end();
})();
