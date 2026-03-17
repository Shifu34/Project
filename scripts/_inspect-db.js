require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'murshid_hospital',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});
async function run() {
  const client = await pool.connect();
  const res = await client.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const tables = {};
  for (const row of res.rows) {
    if (!tables[row.table_name]) tables[row.table_name] = [];
    tables[row.table_name].push({
      col: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable,
      def: row.column_default
    });
  }
  for (const [t, cols] of Object.entries(tables)) {
    console.log('\n=== ' + t + ' ===');
    for (const c of cols) {
      console.log('  ' + c.col.padEnd(30) + c.type.padEnd(30) + (c.nullable === 'YES' ? 'NULL' : 'NOT NULL').padEnd(12) + (c.def || ''));
    }
  }

  // Also check current row counts
  console.log('\n\n=== ROW COUNTS ===');
  for (const t of Object.keys(tables).sort()) {
    const cnt = await client.query('SELECT COUNT(*) as c FROM ' + t);
    console.log('  ' + t.padEnd(30) + cnt.rows[0].c);
  }

  // Check constraints
  console.log('\n\n=== CHECK CONSTRAINTS ===');
  const checks = await client.query(`
    SELECT tc.table_name, cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
    WHERE tc.constraint_type = 'CHECK' AND tc.table_schema = 'public'
    ORDER BY tc.table_name
  `);
  for (const r of checks.rows) {
    console.log('  ' + r.table_name.padEnd(30) + r.check_clause);
  }

  client.release();
  await pool.end();
}
run().catch(e => { console.error(e); process.exit(1); });
