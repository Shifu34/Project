#!/usr/bin/env node
/**
 * Payment-timeout job integration test.
 * 1. Logs in as admin to get a token
 * 2. Gets a real patient_id and doctor_id from the DB
 * 3. Creates a 'scheduled' appointment (no payment)
 * 4. Waits 45 seconds (timeout is 30s, poll is every 10s)
 * 5. Checks the appointment no longer exists
 */

const http = require('http');

const BASE = 'http://localhost:5002/api/v1';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 5002,
      path: `/api/v1${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  console.log('\n=== Payment Timeout Job — Integration Test ===\n');

  // Step 1: Login
  process.stdout.write('1. Logging in as admin... ');
  const loginRes = await request('POST', '/auth/login', {
    identifier: 'dr@dr.com',
    password: 'password',
  });
  const token = loginRes.body?.data?.token;
  if (!token) {
    console.log('FAILED');
    console.error('   Login response:', JSON.stringify(loginRes.body, null, 2));
    process.exit(1);
  }
  console.log('OK');

  // Step 2: Get patient
  process.stdout.write('2. Fetching a patient... ');
  const pRes = await request('GET', '/patients?page=1&limit=1', null, token);
  const patient = pRes.body?.data?.[0];
  if (!patient) {
    console.log('FAILED');
    console.error('   Response:', JSON.stringify(pRes.body, null, 2));
    process.exit(1);
  }
  console.log(`OK (id=${patient.id}, ${patient.first_name} ${patient.last_name})`);

  // Use the logged-in doctor's own doctor_id so the JOIN on users resolves correctly
  const doctorId = loginRes.body?.data?.user?.doctor_id;
  console.log(`3. Using logged-in doctor id=${doctorId}`);

  // Step 4: Create a scheduled appointment (no payment)
  process.stdout.write('4. Creating appointment (status=scheduled, no payment)... ');
  const apptRes = await request('POST', '/appointments', {
    patient_id: patient.id,
    doctor_id: doctorId,
    appointment_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    appointment_time: '23:55',
    appointment_type: 'Online Consultation',
    reason: '[TEST] Payment timeout job test - should be auto-deleted',
  }, token);

  const appt = apptRes.body?.data;
  if (!appt?.id) {
    console.log('FAILED');
    console.error('   Response:', JSON.stringify(apptRes.body, null, 2));
    process.exit(1);
  }
  console.log(`OK (appointment id=${appt.id})`);

  // Step 5: Confirm it exists (GET by id)
  process.stdout.write('5. Confirming appointment exists... ');
  const checkRes = await request('GET', `/appointments/${appt.id}`, null, token);
  if (checkRes.status !== 200) {
    console.log(`FAILED (HTTP ${checkRes.status})`);
    console.error('   Response:', JSON.stringify(checkRes.body, null, 2));
    process.exit(1);
  }
  console.log('OK');

  // Step 6: Wait for 75s (timeout=60s + poll=10s + buffer=5s)
  console.log('\n6. Waiting 75 seconds for the job to fire and delete the appointment...');
  for (let i = 75; i > 0; i -= 5) {
    process.stdout.write(`   ${i}s remaining...\r`);
    await sleep(5000);
  }
  console.log('\n');

  // Step 7: Verify deletion
  process.stdout.write('7. Checking if appointment was deleted... ');
  const afterRes = await request('GET', `/appointments/${appt.id}`, null, token);
  if (afterRes.status === 404) {
    console.log('DELETED ✓');
    console.log('\n✅ TEST PASSED — appointment was auto-deleted after payment timeout.\n');
  } else {
    console.log(`STILL EXISTS (status=${afterRes.status}) ✗`);
    console.error('   Response:', JSON.stringify(afterRes.body, null, 2));
    console.log('\n❌ TEST FAILED\n');
    process.exit(1);
  }
})();
