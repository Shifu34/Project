/**
 * Seed script: generates sample medical PDFs + images,
 * uploads them to Supabase Storage, and inserts
 * medical_reports + report_files records.
 *
 * Run once:  node scripts/_seed-reports-storage.js
 */

'use strict';

const https   = require('https');
const http    = require('http');
const zlib    = require('zlib');
const { Pool } = require('pg');
require('dotenv').config();

// ─── Config ─────────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://lfgjcxmwxgdurxstgqbd.supabase.co';
const SERVICE_ROLE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmZ2pjeG13eGdkdXJ4c3RncWJkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzY5NjA1NywiZXhwIjoyMDg5MjcyMDU3fQ.ak9aT_SrLPFnPhqZ6jpzHNBnx1txf9tbf2U1e-Que-Q';
const BUCKET            = 'Murshid Hospital Storage';
const PUBLIC_BASE       = `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(BUCKET)}`;

// ─── Patient / Doctor IDs (already in DB) ────────────────────────────────────
const PATIENT_ID  = 153657;
const DOCTOR_ID   = 2753;
const CREATED_BY  = 3;           // admin/system user
const ENCOUNTER_13939 = 13939;   // post-op wound check (completed)
const ENCOUNTER_13933 = 13933;   // initial consult (April 15)
const ENCOUNTER_13938 = 13938;   // angina / cardiac workup

// ─── DB ─────────────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ─── PDF generator ──────────────────────────────────────────────────────────
function makePDF(lines) {
  const escape = s => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const streamContent = Buffer.from(
    'BT\n/F1 11 Tf\n50 780 Td\n16 TL\n' +
    lines.map(l => `(${escape(l)}) Tj T*`).join('\n') +
    '\nET'
  );

  const bufs = [];
  const len  = () => bufs.reduce((s, b) => s + b.length, 0);

  bufs.push(Buffer.from('%PDF-1.4\n'));

  const offsets = [];

  offsets.push(len());
  bufs.push(Buffer.from('1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n'));

  offsets.push(len());
  bufs.push(Buffer.from('2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n'));

  offsets.push(len());
  bufs.push(Buffer.from(
    '3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]' +
    ' /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>\nendobj\n'
  ));

  offsets.push(len());
  bufs.push(Buffer.from(`4 0 obj\n<</Length ${streamContent.length}>>\nstream\n`));
  bufs.push(streamContent);
  bufs.push(Buffer.from('\nendstream\nendobj\n'));

  offsets.push(len());
  bufs.push(Buffer.from('5 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>\nendobj\n'));

  const xrefOffset = len();
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  bufs.push(Buffer.from(xref));
  bufs.push(Buffer.from(`trailer\n<</Size 6 /Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`));

  return Buffer.concat(bufs);
}

// ─── PNG generator ──────────────────────────────────────────────────────────
function makePNG(width, height, rgb) {
  const [r, g, b] = rgb;
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (const byte of buf) c = (c >>> 8) ^ CRC_TABLE[(c ^ byte) & 0xFF];
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(type, data) {
    const td   = Buffer.concat([Buffer.from(type), data]);
    const len  = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
    const crc  = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  }

  const sig      = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.allocUnsafe(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; ihdrData[9] = 2; ihdrData[10] = ihdrData[11] = ihdrData[12] = 0;

  // Build raw image: filter byte 0 + RGB per pixel
  const row = Buffer.alloc(1 + width * 3, 0);
  for (let x = 0; x < width; x++) { row[1+x*3]=r; row[1+x*3+1]=g; row[1+x*3+2]=b; }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdrData),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Supabase Storage upload ─────────────────────────────────────────────────
function uploadToStorage(storagePath, fileBuffer, contentType) {
  return new Promise((resolve, reject) => {
    const url     = new URL(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${storagePath}`);
    const options = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  {
        'Authorization':  `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type':   contentType,
        'Content-Length': fileBuffer.length,
        'x-upsert':       'true',
      },
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => {
        const publicUrl = `${PUBLIC_BASE}/${storagePath}`;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`  ✓ uploaded  ${storagePath}  (${fileBuffer.length} bytes)`);
          resolve({ publicUrl, storageKey: storagePath });
        } else {
          reject(new Error(`Upload failed [${res.statusCode}]: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Generate files ────────────────────────────────────────────────────
    console.log('\n📄 Generating files…');

    const files = [
      {
        storagePath: 'reports/discharge-summary-enc13939.pdf',
        contentType: 'application/pdf',
        buffer: makePDF([
          'MURSHID HOSPITAL',
          '─────────────────────────────────────────',
          'DISCHARGE SUMMARY',
          '',
          'Patient : Shafqat Mehmood',
          'DOB     : 19-Dec-2003   Age: 22   Gender: Male',
          'MRN     : 153657        Blood Type: A+',
          '',
          'Admission  : 22-Apr-2026',
          'Discharge  : 23-Apr-2026',
          'Department : General Surgery',
          'Attending  : Dr Ahmed Khalid (Cardiology)',
          '',
          'Diagnosis',
          '  Status post laparoscopic appendectomy.',
          '  Wound healing well. No signs of infection.',
          '',
          'Discharge Condition : Stable',
          '',
          'Discharge Instructions',
          '  - Keep wound dry for 48 hours.',
          '  - Return for suture removal in 5 days.',
          '  - Avoid heavy lifting for 4 weeks.',
          '  - If fever > 38C or wound discharge, visit ER.',
          '',
          'Medications on Discharge',
          '  - Paracetamol 500mg PO TDS x 3 days',
          '  - Metronidazole 400mg PO TDS x 5 days',
          '',
          'Follow-up : 30-Apr-2026 at Surgical OPD',
          '',
          '─────────────────────────────────────────',
          'Signed: Dr Ahmed Khalid',
          'Date  : 23-Apr-2026',
        ]),
        label: 'Discharge Summary PDF (Enc 13939)',
      },
      {
        storagePath: 'reports/wound-check-enc13939.jpg',
        contentType: 'image/jpeg',
        // We generate a valid PNG (browsers/apps accept it regardless of extension)
        buffer: makePNG(400, 300, [210, 220, 205]),  // pale surgical-green tint
        label: 'Wound Check Photo (Enc 13939)',
      },
      {
        storagePath: 'reports/consultation-enc13933.pdf',
        contentType: 'application/pdf',
        buffer: makePDF([
          'MURSHID HOSPITAL',
          '─────────────────────────────────────────',
          'CARDIOLOGY CONSULTATION REPORT',
          '',
          'Patient : Shafqat Mehmood',
          'DOB     : 19-Dec-2003   Age: 22   Gender: Male',
          'MRN     : 153657        Blood Type: A+',
          '',
          'Consultation Date : 15-Apr-2026',
          'Consultant        : Dr Ahmed Khalid',
          'Specialization    : Cardiology',
          '',
          'Reason for Referral',
          '  Episodic chest discomfort on exertion for 3 weeks.',
          '  No prior cardiac history. Non-smoker.',
          '',
          'History',
          '  Patient reports substernal pressure lasting 5-10 minutes,',
          '  relieved by rest. Denies radiation, syncope, palpitations.',
          '  Family history: Father had MI at age 58.',
          '',
          'Examination',
          '  BP: 132/84 mmHg   HR: 88 bpm   SpO2: 98%',
          '  Precordium: normal S1 S2. No murmurs. Chest clear.',
          '',
          'Impression',
          '  Stable angina pectoris (ICD-10: I20.9)',
          '  Risk factors: hypertension, family history.',
          '',
          'Plan',
          '  1. ECG — ordered today.',
          '  2. Echocardiogram — schedule within 1 week.',
          '  3. Fasting lipid profile + FBS.',
          '  4. Start Aspirin 75mg OD after meals.',
          '  5. Lifestyle counselling: low-fat diet, moderate exercise.',
          '  6. Follow-up in 2 weeks with investigation results.',
          '',
          '─────────────────────────────────────────',
          'Signed: Dr Ahmed Khalid',
          'Date  : 15-Apr-2026',
        ]),
        label: 'Consultation Report PDF (Enc 13933)',
      },
      {
        storagePath: 'reports/ecg-enc13933.jpg',
        contentType: 'image/jpeg',
        buffer: makePNG(800, 300, [245, 245, 255]),  // ECG paper (light blue-white)
        label: 'ECG Image (Enc 13933)',
      },
      {
        storagePath: 'reports/cardiac-lab-panel-enc13938.pdf',
        contentType: 'application/pdf',
        buffer: makePDF([
          'MURSHID HOSPITAL — LABORATORY SERVICES',
          '─────────────────────────────────────────',
          'LAB REPORT: CARDIAC PANEL',
          '',
          'Patient    : Shafqat Mehmood   MRN: 153657',
          'DOB        : 19-Dec-2003   Age: 22   Gender: Male',
          'Requesting : Dr Ahmed Khalid (Cardiology)',
          'Order Date : 22-Apr-2026     Priority: URGENT',
          'Report Date: 21-Apr-2026 14:00',
          '',
          '─────────────────────────────────────────',
          'TEST RESULTS',
          '─────────────────────────────────────────',
          '',
          'Test               Result    Unit      Range         Flag',
          '───────────────────────────────────────────────────────',
          'Lipid Profile      238       mg/dL     < 200 mg/dL   HIGH',
          '  (Total Cholesterol)',
          '  Note: LDL elevated. Statin therapy recommended.',
          '',
          'Blood Glucose      94        mg/dL     70-100 mg/dL  Normal',
          '  (Fasting)',
          '',
          '─────────────────────────────────────────',
          'Interpretation',
          '  Dyslipidaemia noted. Combined with family history',
          '  and stable angina symptoms, cardiovascular risk is',
          '  moderate-high. Statin therapy (Atorvastatin 40mg) initiated.',
          '',
          'Verified by Lab Pathologist',
          'Date: 21-Apr-2026',
          '',
          '─────────────────────────────────────────',
          'Signed: Dr Ahmed Khalid',
          'Date  : 22-Apr-2026',
        ]),
        label: 'Cardiac Lab Panel PDF (Enc 13938)',
      },
    ];

    // ── 2. Upload all files ──────────────────────────────────────────────────
    console.log('\n☁️  Uploading to Supabase Storage…');
    const uploaded = {};
    for (const f of files) {
      const result = await uploadToStorage(f.storagePath, f.buffer, f.contentType);
      uploaded[f.storagePath] = result;
    }

    // ── 3. Insert medical_reports ────────────────────────────────────────────
    console.log('\n🗄️  Inserting medical_reports…');

    const report3 = await client.query(
      `INSERT INTO medical_reports
         (report_type, encounter_id, patient_id, doctor_id, title, summary, report_date, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        'discharge',
        ENCOUNTER_13939,
        PATIENT_ID,
        DOCTOR_ID,
        'Post-Operative Discharge Summary — Appendectomy Recovery',
        'Patient recovering well post laparoscopic appendectomy. Wound healing without complications. Suture removal scheduled for 30-Apr-2026.',
        '2026-04-23',
        'final',
        CREATED_BY,
      ]
    );
    const report3Id = report3.rows[0].id;
    console.log(`  ✓ Report 3 (discharge) id=${report3Id}`);

    const report4 = await client.query(
      `INSERT INTO medical_reports
         (report_type, encounter_id, patient_id, doctor_id, title, summary, report_date, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        'clinical',
        ENCOUNTER_13933,
        PATIENT_ID,
        DOCTOR_ID,
        'Initial Cardiology Consultation — Shafqat Mehmood',
        'Patient presents with exertional chest discomfort. Stable angina suspected. ECG, echo, and lipid profile ordered. Aspirin initiated.',
        '2026-04-15',
        'final',
        CREATED_BY,
      ]
    );
    const report4Id = report4.rows[0].id;
    console.log(`  ✓ Report 4 (clinical) id=${report4Id}`);

    // ── 4. Insert report_files ────────────────────────────────────────────────
    console.log('\n📎  Inserting report_files…');

    const fileRows = [
      // Report 3 — discharge summary
      {
        report_id:   report3Id,
        file_name:   'discharge-summary-enc13939.pdf',
        file_type:   'application/pdf',
        storage_path: 'reports/discharge-summary-enc13939.pdf',
      },
      {
        report_id:   report3Id,
        file_name:   'wound-check-enc13939.jpg',
        file_type:   'image/jpeg',
        storage_path: 'reports/wound-check-enc13939.jpg',
      },
      // Report 4 — consultation
      {
        report_id:   report4Id,
        file_name:   'consultation-enc13933.pdf',
        file_type:   'application/pdf',
        storage_path: 'reports/consultation-enc13933.pdf',
      },
      {
        report_id:   report4Id,
        file_name:   'ecg-enc13933.jpg',
        file_type:   'image/jpeg',
        storage_path: 'reports/ecg-enc13933.jpg',
      },
      // Report 1 (existing lab report) — additional PDF
      {
        report_id:   1,
        file_name:   'cardiac-lab-panel-enc13938.pdf',
        file_type:   'application/pdf',
        storage_path: 'reports/cardiac-lab-panel-enc13938.pdf',
      },
    ];

    for (const f of fileRows) {
      const { publicUrl } = uploaded[f.storage_path];
      const bufSize = files.find(x => x.storagePath === f.storage_path).buffer.length;
      await client.query(
        `INSERT INTO report_files
           (report_id, file_name, file_type, file_size, storage_url, storage_key, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [f.report_id, f.file_name, f.file_type, bufSize, publicUrl, f.storage_path, CREATED_BY]
      );
      console.log(`  ✓ file_link  ${f.file_name}  → report_id=${f.report_id}`);
    }

    await client.query('COMMIT');
    console.log('\n✅  All done!\n');
    console.log('Reports created:');
    console.log(`  id=${report3Id}  discharge  enc=${ENCOUNTER_13939}`);
    console.log(`  id=${report4Id}  clinical   enc=${ENCOUNTER_13933}`);
    console.log('\nPublic file URLs:');
    for (const f of files) {
      console.log(`  ${uploaded[f.storagePath].publicUrl}`);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌  Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(() => process.exit(1));
