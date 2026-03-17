/**
 * dump-tables.js
 * Dumps all table contents to the console or a file.
 *
 * Usage:
 *   node scripts/dump-tables.js              → prints to terminal
 *   node scripts/dump-tables.js --file       → writes to dump-tables.txt
 *   node scripts/dump-tables.js --file out.txt → writes to out.txt
 *   node scripts/dump-tables.js --table users → single table only
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs       = require('fs');
const path     = require('path');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME     || 'murshid_hospital',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '123',
});

// ── CLI args ──────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const fileFlag   = args.includes('--file');
const tableIdx   = args.indexOf('--table');
const onlyTable  = tableIdx !== -1 ? args[tableIdx + 1] : null;

const defaultOut = path.join(__dirname, 'dump-tables.txt');
const fileArgIdx = args.indexOf('--file');
const outPath    = (fileFlag && args[fileArgIdx + 1] && !args[fileArgIdx + 1].startsWith('--'))
  ? args[fileArgIdx + 1]
  : defaultOut;

// ── All tables in schema order ────────────────────────────────────────────────
const ALL_TABLES = [
  'organizations', 'roles', 'users', 'user_profiles',
  'patients', 'insurance_providers', 'user_insurances',
  'departments', 'doctors', 'doctor_schedules', 'appointments',
  'payments', 'payment_refunds', 'encounters', 'diagnoses',
  'clinical_notes', 'vitals', 'prescriptions', 'prescription_items',
  'inventory_items', 'inventory_transactions',
  'lab_test_catalog', 'lab_orders', 'lab_order_items',
  'radiology_test_catalog', 'radiology_orders', 'radiology_order_items',
  'subscription_plans', 'user_subscriptions',
  'ai_sessions', 'ai_outputs', 'ai_transcripts',
  'notifications', 'audit_logs',
];

const tables = onlyTable ? [onlyTable] : ALL_TABLES;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTable(tableName, columns, rows) {
  const lines = [];
  const divider = '─'.repeat(80);

  lines.push('');
  lines.push(`╔══ ${tableName.toUpperCase()} (${rows.length} rows) ══`);
  lines.push(divider);

  if (rows.length === 0) {
    lines.push('  (empty)');
    lines.push(divider);
    return lines.join('\n');
  }

  // Column widths: max of header length and longest value (capped at 40)
  const widths = {};
  for (const col of columns) {
    widths[col] = Math.min(40, col.length);
  }
  for (const row of rows) {
    for (const col of columns) {
      const val = row[col] === null ? 'NULL' : String(row[col]);
      widths[col] = Math.min(40, Math.max(widths[col], val.length));
    }
  }

  // Header
  const header = columns.map(c => c.padEnd(widths[c])).join(' | ');
  lines.push('  ' + header);
  lines.push('  ' + columns.map(c => '-'.repeat(widths[c])).join('-+-'));

  // Rows
  for (const row of rows) {
    const line = columns.map(col => {
      const val = row[col] === null ? 'NULL' : String(row[col]);
      const truncated = val.length > 40 ? val.slice(0, 37) + '...' : val;
      return truncated.padEnd(widths[col]);
    }).join(' | ');
    lines.push('  ' + line);
  }

  lines.push(divider);
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const client = await pool.connect();
  const output = [];

  const timestamp = new Date().toISOString();
  output.push(`Murshid Hospital — Table Dump`);
  output.push(`Generated: ${timestamp}`);
  output.push(`Database:  ${process.env.DB_NAME || 'murshid_hospital'}`);
  output.push('═'.repeat(80));

  // Row count summary first
  output.push('\n── ROW COUNTS ─────────────────────────────────────────────────────────────────');
  const counts = {};
  for (const t of tables) {
    try {
      const r = await client.query(`SELECT COUNT(*) AS cnt FROM "${t}"`);
      counts[t] = parseInt(r.rows[0].cnt, 10);
      output.push(`  ${t.padEnd(35)} ${counts[t]}`);
    } catch (e) {
      counts[t] = -1;
      output.push(`  ${t.padEnd(35)} ERROR: ${e.message}`);
    }
  }

  // Full table contents
  for (const t of tables) {
    if (counts[t] === -1) continue;
    try {
      const res = await client.query(`SELECT * FROM "${t}" ORDER BY id LIMIT 10000`);
      const cols = res.fields.map(f => f.name);
      output.push(formatTable(t, cols, res.rows));
    } catch (e) {
      // table may not have an id column — retry without ORDER BY
      try {
        const res = await client.query(`SELECT * FROM "${t}" LIMIT 10000`);
        const cols = res.fields.map(f => f.name);
        output.push(formatTable(t, cols, res.rows));
      } catch (e2) {
        output.push(`\n╔══ ${t.toUpperCase()} — QUERY ERROR: ${e2.message}`);
      }
    }
  }

  output.push('\n── END OF DUMP ─────────────────────────────────────────────────────────────────');

  const text = output.join('\n');

  if (fileFlag) {
    fs.writeFileSync(outPath, text, 'utf8');
    console.log(`✅  Dump written to: ${outPath}`);
  } else {
    console.log(text);
  }

  client.release();
  await pool.end();
})();
