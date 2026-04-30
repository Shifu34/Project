'use strict';
const https = require('https');
const zlib  = require('zlib');
const { Pool } = require('pg');
require('dotenv').config();

const SUPABASE_URL     = 'https://lfgjcxmwxgdurxstgqbd.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmZ2pjeG13eGdkdXJ4c3RncWJkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzY5NjA1NywiZXhwIjoyMDg5MjcyMDU3fQ.ak9aT_SrLPFnPhqZ6jpzHNBnx1txf9tbf2U1e-Que-Q';
const BUCKET           = 'Murshid Hospital Storage';
const PUBLIC_BASE      = `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(BUCKET)}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

function makePDF(lines) {
  const escape = s => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const streamContent = Buffer.from(
    'BT\n/F1 11 Tf\n50 780 Td\n16 TL\n' +
    lines.map(l => `(${escape(l)}) Tj T*`).join('\n') + '\nET'
  );
  const bufs = [], offsets = [];
  const len = () => bufs.reduce((s, b) => s + b.length, 0);
  bufs.push(Buffer.from('%PDF-1.4\n'));
  offsets.push(len()); bufs.push(Buffer.from('1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n'));
  offsets.push(len()); bufs.push(Buffer.from('2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n'));
  offsets.push(len()); bufs.push(Buffer.from('3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>\nendobj\n'));
  offsets.push(len()); bufs.push(Buffer.from(`4 0 obj\n<</Length ${streamContent.length}>>\nstream\n`));
  bufs.push(streamContent); bufs.push(Buffer.from('\nendstream\nendobj\n'));
  offsets.push(len()); bufs.push(Buffer.from('5 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>\nendobj\n'));
  const xo = len();
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
  bufs.push(Buffer.from(xref));
  bufs.push(Buffer.from(`trailer\n<</Size 6 /Root 1 0 R>>\nstartxref\n${xo}\n%%EOF\n`));
  return Buffer.concat(bufs);
}

function makePNG(w, h, rgb) {
  const [r, g, b] = rgb;
  const T = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); T[i] = c; }
  const crc32 = buf => { let c = 0xFFFFFFFF; for (const x of buf) c = (c >>> 8) ^ T[(c ^ x) & 0xFF]; return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => {
    const td = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
    const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const hd = Buffer.allocUnsafe(13);
  hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = 2; hd[10] = hd[11] = hd[12] = 0;
  const row = Buffer.alloc(1 + w * 3, 0);
  for (let x = 0; x < w; x++) { row[1 + x * 3] = r; row[1 + x * 3 + 1] = g; row[1 + x * 3 + 2] = b; }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([sig, chunk('IHDR', hd), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function upload(storagePath, buf, contentType) {
  return new Promise((resolve, reject) => {
    const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
    const url = new URL(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${storagePath}`);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type':   contentType,
        'Content-Length': buf.length,
        'x-upsert':       'true',
      },
    }, res => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const publicUrl = `${PUBLIC_BASE}/${storagePath}`;
          console.log(`  ✓ uploaded  ${storagePath}`);
          resolve(publicUrl);
        } else {
          reject(new Error(`Upload failed [${res.statusCode}]: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

async function main() {
  const files = [
    {
      id: 1,
      path: 'reports/lab-report-shafqat-2026-04-21.pdf',
      ct: 'application/pdf',
      buf: makePDF([
        'MURSHID HOSPITAL — LABORATORY SERVICES',
        '─────────────────────────────────────────',
        'LAB REPORT: CARDIAC PANEL',
        '',
        'Patient    : Shafqat Mehmood   MRN: 153657',
        'Requesting : Dr Ahmed Khalid (Cardiology)',
        'Report Date: 21-Apr-2026 14:00',
        '',
        'Test               Result    Unit      Range         Flag',
        '───────────────────────────────────────────────────────',
        'Lipid Profile      238       mg/dL     < 200 mg/dL   HIGH',
        'Blood Glucose      94        mg/dL     70-100 mg/dL  Normal',
        '',
        'Impression: Dyslipidaemia. Statin therapy initiated.',
        '',
        'Verified by Lab Pathologist',
        'Date: 21-Apr-2026',
      ]),
    },
    {
      id: 2,
      path: 'reports/cxr-shafqat-2026-04-21.jpg',
      ct: 'image/jpeg',
      buf: makePNG(600, 300, [245, 245, 255]),
    },
    {
      id: 3,
      path: 'reports/echo-report-shafqat-2026-04-22.pdf',
      ct: 'application/pdf',
      buf: makePDF([
        'MURSHID HOSPITAL — ECHOCARDIOGRAPHY',
        '─────────────────────────────────────────',
        'ECHO REPORT',
        '',
        'Patient    : Shafqat Mehmood   MRN: 153657',
        'Date       : 22-Apr-2026',
        'Cardiologist: Dr Ahmed Khalid',
        '',
        'Findings',
        '  EF: 52%   Mild left ventricular hypertrophy.',
        '  No wall motion abnormality.',
        '  Mild diastolic dysfunction (Grade I).',
        '',
        'Impression',
        '  Stable cardiac function. Grade I diastolic dysfunction.',
        '',
        'Recommendation',
        '  Optimise antihypertensive therapy. Repeat echo in 6 months.',
        '',
        '─────────────────────────────────────────',
        'Signed: Dr Ahmed Khalid   Date: 22-Apr-2026',
      ]),
    },
  ];

  const client = await pool.connect();
  try {
    console.log('\n☁️  Uploading missing files to Supabase Storage…');
    for (const f of files) {
      const publicUrl = await upload(f.path, f.buf, f.ct);
      await client.query(
        'UPDATE report_files SET storage_url = $1, storage_key = $2, file_size = $3 WHERE id = $4',
        [publicUrl, f.path, f.buf.length, f.id]
      );
      console.log(`  ✓ updated   report_files id=${f.id}`);
    }
    console.log('\n✅  All dummy URLs replaced with real Supabase URLs.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
