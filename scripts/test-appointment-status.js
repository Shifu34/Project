require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function test() {
  const client = await pool.connect();
  try {
    // 1. Find a real patient_id and doctor_id
    const p = await client.query('SELECT id FROM patients LIMIT 1');
    const d = await client.query('SELECT id FROM doctors LIMIT 1');
    if (!p.rows.length || !d.rows.length) {
      console.log('No patients or doctors found');
      return;
    }
    const patientId = p.rows[0].id;
    const doctorId  = d.rows[0].id;
    console.log('Using patient:', patientId, 'doctor:', doctorId);

    // 2. Insert an appointment that started 5 mins ago with duration=1 min
    //    (so it is already past both the start AND end time)
    const appt = await client.query(
      `INSERT INTO appointments
         (patient_id, doctor_id, appointment_date, appointment_time, duration_minutes, status)
       VALUES ($1, $2, CURRENT_DATE, (NOW() - INTERVAL '5 minutes')::TIME, 1, 'confirmed')
       RETURNING id, status, appointment_date, appointment_time, duration_minutes`,
      [patientId, doctorId],
    );
    const row = appt.rows[0];
    console.log('Created test appointment:', row);

    // 3. Job step 1 — confirmed → in_progress
    const r1 = await client.query(
      `UPDATE appointments
       SET status = 'in_progress'
       WHERE status IN ('scheduled','confirmed')
         AND (appointment_date + appointment_time)::TIMESTAMP <= NOW()
         AND id = $1
       RETURNING id, status`,
      [row.id],
    );
    console.log('After step 1 (→ in_progress):', r1.rows[0]);

    // 4. Job step 2 — in_progress → pending
    const r2 = await client.query(
      `UPDATE appointments
       SET status = 'pending'
       WHERE status = 'in_progress'
         AND (appointment_date + appointment_time)::TIMESTAMP
               + (duration_minutes || ' minutes')::INTERVAL <= NOW()
         AND id = $1
       RETURNING id, status`,
      [row.id],
    );
    console.log('After step 2 (→ pending):', r2.rows[0]);

    // 5. Clean up
    await client.query('DELETE FROM appointments WHERE id = $1', [row.id]);
    console.log('Cleaned up — test appointment deleted.');
  } finally {
    client.release();
    await pool.end();
  }
}

test().catch(console.error);
