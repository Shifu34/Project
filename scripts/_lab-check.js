require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'murshid_hospital',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function run() {
  const r1 = await pool.query(`
    SELECT COUNT(*)::int AS total,
      SUM(CASE WHEN encounter_id   IS NOT NULL THEN 1 ELSE 0 END)::int AS encounter_id,
      SUM(CASE WHEN patient_id     IS NOT NULL THEN 1 ELSE 0 END)::int AS patient_id,
      SUM(CASE WHEN doctor_id      IS NOT NULL THEN 1 ELSE 0 END)::int AS doctor_id,
      SUM(CASE WHEN ordered_by     IS NOT NULL THEN 1 ELSE 0 END)::int AS ordered_by,
      SUM(CASE WHEN order_date     IS NOT NULL THEN 1 ELSE 0 END)::int AS order_date,
      SUM(CASE WHEN clinical_notes IS NOT NULL THEN 1 ELSE 0 END)::int AS clinical_notes
    FROM lab_orders
  `);
  console.log('\nlab_orders fill rates:');
  console.table(r1.rows);

  const r2 = await pool.query(`
    SELECT COUNT(*)::int AS total,
      SUM(CASE WHEN result_value   IS NOT NULL THEN 1 ELSE 0 END)::int AS result_value,
      SUM(CASE WHEN unit           IS NOT NULL THEN 1 ELSE 0 END)::int AS unit,
      SUM(CASE WHEN normal_range   IS NOT NULL THEN 1 ELSE 0 END)::int AS normal_range,
      SUM(CASE WHEN interpretation IS NOT NULL THEN 1 ELSE 0 END)::int AS interpretation,
      SUM(CASE WHEN result_notes   IS NOT NULL THEN 1 ELSE 0 END)::int AS result_notes,
      SUM(CASE WHEN result_date    IS NOT NULL THEN 1 ELSE 0 END)::int AS result_date,
      SUM(CASE WHEN performed_by   IS NOT NULL THEN 1 ELSE 0 END)::int AS performed_by,
      SUM(CASE WHEN verified_by    IS NOT NULL THEN 1 ELSE 0 END)::int AS verified_by
    FROM lab_order_items
  `);
  console.log('\nlab_order_items fill rates:');
  console.table(r2.rows);

  const r3 = await pool.query(`
    SELECT loi.result_value, loi.unit, loi.normal_range, loi.interpretation, loi.result_date,
           ltc.name AS test_name, ltc.unit AS catalog_unit, ltc.normal_range AS catalog_range
    FROM lab_order_items loi
    JOIN lab_test_catalog ltc ON ltc.id = loi.lab_test_id
    LIMIT 5
  `);
  console.log('\nSample rows from lab_order_items (joined with catalog):');
  console.table(r3.rows);

  await pool.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
