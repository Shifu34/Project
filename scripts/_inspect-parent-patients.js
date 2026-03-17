/**
 * Inspect care_person and care_test_findings in the parent dump
 * to assess CNIC data quality and lab history availability.
 */
const fs       = require('fs');
const readline = require('readline');

const DUMP = '/Users/mikey/Downloads/Parent_DB.sql';

async function main() {
  const data = { care_person: [], care_test_findings: [], care_encounter: [] };
  const cols = {};

  const rl = readline.createInterface({
    input: fs.createReadStream(DUMP, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  const TARGET = new Set(['care_person', 'care_encounter', 'care_test_findings']);
  let currentTable = null;
  let insertBuffer = '';

  // Reuse the robust parser from migrate script
  const parseRow = (row) => {
    const tokens = [];
    let cur = '', inStr = false, strChar = '', i = 0;
    while (i < row.length && row[i] !== '(') i++;
    i++;
    while (i < row.length) {
      const ch = row[i];
      if (!inStr) {
        if (ch === "'" || ch === '"') { inStr = true; strChar = ch; cur += ch; }
        else if (ch === ',') { tokens.push(cur.trim()); cur = ''; }
        else if (ch === ')') { tokens.push(cur.trim()); break; }
        else { cur += ch; }
      } else {
        if (ch === '\\') { cur += ch + (row[i+1] || ''); i++; }
        else if (ch === strChar) { inStr = false; cur += ch; }
        else { cur += ch; }
      }
      i++;
    }
    return tokens;
  };

  const clean = (v) => {
    if (!v || v === 'NULL') return null;
    v = v.trim();
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    return v.replace(/\\'/g, "'").replace(/\\\\/g, '\\') || null;
  };

  const toObj = (table, tokens) => {
    const obj = {};
    (cols[table] || []).forEach((c, i) => { obj[c] = clean(tokens[i]); });
    return obj;
  };

  for await (const line of rl) {
    const trimmed = line.trimStart();

    // Detect INSERT and capture column list
    const insMatch = trimmed.match(/^INSERT INTO `(\w+)`\s*\(([^)]+)\)\s*VALUES/i);
    if (insMatch) {
      const tbl = insMatch[1];
      if (TARGET.has(tbl)) {
        currentTable = tbl;
        cols[tbl] = insMatch[2].split(',').map(c => c.trim().replace(/`/g, ''));
        insertBuffer = trimmed;
      } else {
        currentTable = null;
      }
      continue;
    }

    if (!currentTable) continue;
    insertBuffer += ' ' + trimmed;

    // Each VALUES row ending with ), or );
    if (trimmed.endsWith('),') || trimmed.endsWith(');')) {
      const rowMatches = insertBuffer.match(/\((?:[^)(]|\((?:[^)(]|\([^)(]*\))*\))*\)/g);
      if (rowMatches) {
        for (const rm of rowMatches) {
          // skip the column-list match
          if (rm.includes('`')) continue;
          data[currentTable].push(parseRow(rm));
        }
      }
      insertBuffer = '';
      if (trimmed.endsWith(');')) currentTable = null;
    }
  }

  // ── care_person analysis ────────────────────────────────────────────────────
  console.log('\n=== PATIENT (care_person) ANALYSIS ===');
  let total = 0, withCnic = 0, withPhone = 0, withEmail = 0;
  const pidToCnic = {};
  const sampleCnic = [];

  for (const tokens of data['care_person']) {
    const r = toObj('care_person', tokens);
    if (!r['pid']) continue;
    total++;
    const cnic = r['nat_id_nr'];
    const validCnic = cnic && /^\d{13}$/.test(cnic);
    if (validCnic) {
      withCnic++;
      pidToCnic[r['pid']] = cnic;
      if (sampleCnic.length < 5) {
        sampleCnic.push({ pid: r['pid'], name: `${r['name_first']} ${r['name_last']}`, cnic, dob: r['date_birth'] });
      }
    }
    if (r['cellphone_1_nr'] && r['cellphone_1_nr'] !== '-' && r['cellphone_1_nr'] !== '--') withPhone++;
    if (r['email']) withEmail++;
  }

  console.log(`  Total patients:          ${total}`);
  console.log(`  With valid 13-digit CNIC:${withCnic}  (${Math.round(withCnic/total*100)}%)`);
  console.log(`  With phone number:       ${withPhone}`);
  console.log(`  With email:              ${withEmail}`);
  console.log('\n  Sample patients with CNIC:');
  sampleCnic.forEach(p => console.log(`    pid=${p.pid}  cnic=${p.cnic}  dob=${p.dob}  name=${p.name}`));

  // ── care_encounter analysis ─────────────────────────────────────────────────
  console.log('\n=== ENCOUNTER ANALYSIS ===');
  const encNrToPid = {};
  for (const tokens of data['care_encounter']) {
    const r = toObj('care_encounter', tokens);
    if (r['encounter_nr'] && r['pid']) encNrToPid[r['encounter_nr']] = r['pid'];
  }
  console.log(`  Encounters loaded: ${Object.keys(encNrToPid).length}`);

  // ── care_test_findings analysis ─────────────────────────────────────────────
  console.log('\n=== LAB FINDINGS (care_test_findings) ANALYSIS ===');
  let findings = 0, cancelled = 0, withResults = 0, linkedToPatient = 0;
  const groupCounts = {};
  const sampleFindings = [];

  for (const tokens of data['care_test_findings']) {
    const r = toObj('care_test_findings', tokens);
    findings++;
    if (r['is_cancel'] === '1') { cancelled++; continue; }
    const val = r['serial_value'];
    if (val && val.includes(':')) {
      withResults++;
      const pid = encNrToPid[r['encounter_nr']];
      if (pid && pidToCnic[pid]) linkedToPatient++;
      const grp = r['group_id'] || 'unknown';
      groupCounts[grp] = (groupCounts[grp] || 0) + 1;
      if (sampleFindings.length < 4) {
        sampleFindings.push({
          encounter_nr: r['encounter_nr'],
          group: grp,
          date: r['test_date'],
          result_preview: (val || '').substring(0, 80),
          pid: pid || '?',
          cnic: pid ? (pidToCnic[pid] || 'no-cnic') : '?',
        });
      }
    }
  }

  console.log(`  Total findings:               ${findings}`);
  console.log(`  Cancelled:                    ${cancelled}`);
  console.log(`  With actual results:          ${withResults}`);
  console.log(`  Linked to patient with CNIC:  ${linkedToPatient}`);
  console.log('\n  Results by test group:');
  Object.entries(groupCounts).sort((a,b)=>b[1]-a[1]).forEach(([g,c]) => console.log(`    ${g.padEnd(35)} ${c}`));
  console.log('\n  Sample findings:');
  sampleFindings.forEach(f => console.log(`    enc=${f.encounter_nr}  pid=${f.pid}  cnic=${f.cnic}  group=${f.group}  date=${f.date}\n      → ${f.result_preview}`));
}

main().catch(console.error);
