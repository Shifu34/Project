/**
 * Usage:
 *   node scripts/inspect-sql.js <path-to-sql-file>
 *
 * Example:
 *   node scripts/inspect-sql.js ~/Desktop/parent_db.sql
 *
 * What it does:
 *   - Reads the SQL file
 *   - Finds every CREATE TABLE block
 *   - Prints table names + columns in a readable format
 *   - Lists INSERT INTO statements so we know what seed data exists
 */

const fs   = require('fs');
const path = require('path');

const filePath = process.argv[2];

if (!filePath) {
  console.error('❌  Please provide the path to the SQL file.');
  console.error('    Example: node scripts/inspect-sql.js ~/Desktop/parent_db.sql');
  process.exit(1);
}

const resolved = path.resolve(filePath);

if (!fs.existsSync(resolved)) {
  console.error(`❌  File not found: ${resolved}`);
  process.exit(1);
}

const sql = fs.readFileSync(resolved, 'utf8');

// ── 0. Print first 40 lines so we can see the dump format ────────────────────
console.log('\n--- FIRST 40 LINES OF FILE ---');
sql.split('\n').slice(0, 40).forEach((l, i) => console.log(`${String(i+1).padStart(3)}: ${l}`));
console.log('--- END PREVIEW ---\n');

// ── 1. Extract CREATE TABLE blocks (MySQL backtick + PG double-quote + bare) ──
const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:`\w+`|"\w+"|\w+)\.)?(?:`(\w+)`|"(\w+)"|(\w+))\s*\(/gis;
const tables = [];
let match;

while ((match = tableRegex.exec(sql)) !== null) {
  const tableName = match[1] || match[2] || match[3];
  // Grab everything between the opening ( and the matching );
  let depth = 1, i = match.index + match[0].length, body = '';
  while (i < sql.length && depth > 0) {
    if (sql[i] === '(') depth++;
    else if (sql[i] === ')') { depth--; if (depth === 0) break; }
    body += sql[i++];
  }

  const columns = body
    .split('\n')
    .map(l => l.trim())
    .filter(l =>
      l.length > 0 &&
      !l.toUpperCase().startsWith('CONSTRAINT') &&
      !l.toUpperCase().startsWith('PRIMARY KEY') &&
      !l.toUpperCase().startsWith('FOREIGN KEY') &&
      !l.toUpperCase().startsWith('UNIQUE') &&
      !l.toUpperCase().startsWith('CHECK') &&
      !l.toUpperCase().startsWith('INDEX') &&
      !l.startsWith('--')
    )
    .map(l => {
      const parts = l.replace(/,$/, '').trim().split(/\s+/);
      return `    ${parts[0].replace(/[`"]/g,'')}  ${parts[1] || ''}`;
    });

  tables.push({ tableName, columns });
}

// ── 2. Extract INSERT INTO table names (MySQL backtick + PG + bare) ──────────
const insertRegex = /INSERT\s+INTO\s+(?:(?:`\w+`|"\w+"|\w+)\.)?(?:`(\w+)`|"(\w+)"|(\w+))/gis;
const inserts = new Set();
while ((match = insertRegex.exec(sql)) !== null) {
  inserts.add(match[1] || match[2] || match[3]);
}

// ── 3. Extract COPY (pg_dump bulk-copy format) table names ───────────────────
const copyRegex = /^COPY\s+(?:(?:\w+|"\w+")\.)?(?:"(\w+)"|(\w+))\s+\(/gim;
const copies = new Set();
while ((match = copyRegex.exec(sql)) !== null) {
  copies.add(match[1] || match[2]);
}

// ── 4. Print summary ─────────────────────────────────────────────────────────
console.log('='.repeat(60));
console.log(`  SQL FILE: ${path.basename(resolved)}`);
console.log(`  SIZE:     ${(fs.statSync(resolved).size / 1024).toFixed(1)} KB`);
console.log('='.repeat(60));

if (tables.length === 0) {
  console.log('\n⚠️  No CREATE TABLE statements found.\n');
} else {
  console.log(`\n📋  TABLES FOUND (${tables.length})\n`);
  for (const { tableName, columns } of tables) {
    console.log(`  ┌─ ${tableName.toUpperCase()}`);
    for (const col of columns) {
      console.log(`  │${col}`);
    }
    console.log('');
  }
}

if (inserts.size > 0) {
  console.log('\n📦  TABLES WITH INSERT DATA:\n');
  for (const t of [...inserts].sort()) console.log(`    • ${t}`);
}

if (copies.size > 0) {
  console.log('\n📦  TABLES WITH COPY (pg_dump) DATA:\n');
  for (const t of [...copies].sort()) console.log(`    • ${t}`);
}

console.log('\n' + '='.repeat(60));
console.log('  Done. Share the output above and I will write the import.');
console.log('='.repeat(60) + '\n');
