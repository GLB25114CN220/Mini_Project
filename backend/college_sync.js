// college_sync.js — connects the COLLEGE APP DATABASE to this website.
//
// Every student found in the college database is copied (and kept up to date) as
//   1) a student record  -> shows up as a card in  Students > Branch > Section
//   2) an admission ID   -> shows up in            Admission IDs
// If the college record has no admission ID, a new one (ADM-2026-0097 ...) is generated automatically.
//
// The college database is only READ, never changed. Point COLLEGE_DB_PATH (backend/.env) to:
//   - a SQLite file (.sqlite / .db) with a "students" table (name it with COLLEGE_TABLE), or
//   - a .csv export with the same columns.
// Column names are matched flexibly (see ALIASES below), so a real college database with slightly different names works too.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');
const db = require('./db');
const s = require('./services');

const ALIASES = {
  name:          ['student_name', 'name', 'full_name', 'fullname'],
  branch_code:   ['branch_code', 'branchcode', 'dept_code', 'department_code'],
  branch_name:   ['branch_name', 'branch', 'department', 'department_name', 'course'],
  section:       ['section', 'sec', 'class_section'],
  roll_no:       ['roll_number', 'roll_no', 'rollno', 'roll', 'enrollment_no'],
  admission_id:  ['admission_id', 'admission_no', 'admission_number', 'admissionid'],
  academic_year: ['academic_year', 'session', 'batch'],
  email:         ['email', 'email_id'],
  phone:         ['phone', 'mobile', 'phone_number'],
};

// ---------------------------------------------------------------- reading the college data
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((x) => x !== '')) rows.push(row); }
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

function readSource(file = config.COLLEGE_DB_PATH, table = config.COLLEGE_TABLE) {
  if (/\.csv$/i.test(file)) return parseCsv(fs.readFileSync(file, 'utf8'));
  const src = new DatabaseSync(file, { readOnly: true });
  try {
    if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error('COLLEGE_TABLE must be a plain table name');
    return src.prepare(`SELECT * FROM ${table}`).all();
  } finally {
    src.close();
  }
}

// Turns one raw college row into our field names (or null if the row has no name / roll number).
function mapRow(raw) {
  const lower = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.trim().toLowerCase(), v]));
  const pick = (field) => {
    for (const a of ALIASES[field]) if (lower[a] !== undefined && lower[a] !== null && String(lower[a]).trim() !== '') return String(lower[a]).trim();
    return '';
  };
  const r = Object.fromEntries(Object.keys(ALIASES).map((f) => [f, pick(f)]));
  if (!r.name || !r.roll_no) return null;
  if (!r.branch_code && r.branch_name) r.branch_code = r.branch_name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 6);
  if (!r.branch_code) r.branch_code = 'OTH';
  if (!r.branch_name) r.branch_name = r.branch_code;
  r.branch_code = r.branch_code.toUpperCase().slice(0, 12);
  r.section = (r.section || 'A').toUpperCase().slice(0, 5);
  r.admission_id = r.admission_id.toUpperCase().replace(/\s+/g, '');
  return r;
}

// ---------------------------------------------------------------- writing into our database
function upsertStudent(r) {
  const year = s.yearLabel(r.academic_year);
  const existing = db.prepare('SELECT id, source FROM students WHERE roll_no = ?').get(r.roll_no);
  if (existing) {
    db.prepare(`UPDATE students SET name = ?, branch = ?, branch_code = ?, section = ?, year = ?, academic_year = ?,
                  email = COALESCE(NULLIF(?, ''), email), phone = COALESCE(NULLIF(?, ''), phone), source = 'college' WHERE id = ?`)
      .run(r.name, r.branch_name, r.branch_code, r.section, year, r.academic_year || null, r.email, r.phone, existing.id);
    return { id: existing.id, created: false };
  }
  const ins = db.prepare(`INSERT INTO students (name, roll_no, branch, year, email, phone, branch_code, section, academic_year, source)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'college')`)
    .run(r.name, r.roll_no, r.branch_name, year, r.email || null, r.phone || null, r.branch_code, r.section, r.academic_year || null);
  return { id: Number(ins.lastInsertRowid), created: true };
}

// Makes sure the student has exactly the admission ID the college gave (or a generated one).
// Returns 'created' | 'renamed' | 'linked' | 'same' | 'conflict'.
function ensureAdmission(studentId, r) {
  const byStudent = db.prepare('SELECT id, admission_id FROM admission_ids WHERE student_id = ?').get(studentId);
  if (!r.admission_id) {
    if (byStudent) return 'same'; // keep the ID the student already has
    const year = parseInt(r.academic_year, 10) || new Date().getFullYear();
    db.prepare('INSERT INTO admission_ids (admission_id, student_id) VALUES (?, ?)').run(s.nextAdmissionId(year), studentId);
    return 'created';
  }
  const byId = db.prepare('SELECT id, student_id FROM admission_ids WHERE admission_id = ?').get(r.admission_id);
  if (byId) {
    if (byId.student_id === studentId) return 'same';
    if (byId.student_id !== null) return 'conflict';          // that ID already belongs to another student
    if (byStudent) return 'conflict';                         // this student already has a different ID
    db.prepare('UPDATE admission_ids SET student_id = ? WHERE id = ?').run(studentId, byId.id);
    return 'linked';
  }
  if (byStudent) {
    db.prepare('UPDATE admission_ids SET admission_id = ? WHERE id = ?').run(r.admission_id, byStudent.id);
    return 'renamed';
  }
  db.prepare('INSERT INTO admission_ids (admission_id, student_id) VALUES (?, ?)').run(r.admission_id, studentId);
  return 'created';
}

// ---------------------------------------------------------------- the sync itself
let last = null;        // result of the latest run, shown on the Admission IDs page
let lastMtime = 0;      // so the automatic check only works when the file changed

function status() {
  const file = config.COLLEGE_DB_PATH;
  return {
    source: path.basename(file),
    available: fs.existsSync(file),
    auto_minutes: config.COLLEGE_SYNC_MINUTES,
    last,
  };
}

function syncFromCollege({ force = true } = {}) {
  const file = config.COLLEGE_DB_PATH;
  if (!fs.existsSync(file)) {
    last = { ok: false, at: new Date().toISOString(), error: 'College database file not found: ' + path.basename(file) };
    return last;
  }
  const mtime = fs.statSync(file).mtimeMs;
  if (!force && mtime === lastMtime) return last;

  let raw;
  try { raw = readSource(file); } catch (err) {
    last = { ok: false, at: new Date().toISOString(), error: 'Could not read the college database: ' + err.message };
    return last;
  }
  const out = { ok: true, at: new Date().toISOString(), source: path.basename(file), total: raw.length,
    students_created: 0, students_updated: 0, ids_created: 0, ids_changed: 0, conflicts: 0, skipped: 0 };

  s.transaction(() => {
    for (const row of raw) {
      const r = mapRow(row);
      if (!r) { out.skipped++; continue; }
      const st = upsertStudent(r);
      if (st.created) out.students_created++; else out.students_updated++;
      const res = ensureAdmission(st.id, r);
      if (res === 'created') out.ids_created++;
      else if (res === 'renamed' || res === 'linked') out.ids_changed++;
      else if (res === 'conflict') out.conflicts++;
    }
  });
  lastMtime = mtime;
  last = out;
  return out;
}

// Runs once at start-up and then every COLLEGE_SYNC_MINUTES (only does work if the college file changed).
function startAutoSync() {
  try {
    const first = syncFromCollege({ force: true });
    if (first.ok) {
      console.log(`College database "${first.source}" connected: ${first.students_created} new students, ${first.ids_created} admission IDs created, ${first.students_updated} updated.`);
    } else {
      console.warn('College database not connected: ' + first.error);
    }
  } catch (err) { console.error('College sync failed:', err.message); }
  if (config.COLLEGE_SYNC_MINUTES > 0) {
    const timer = setInterval(() => {
      try { syncFromCollege({ force: false }); } catch (err) { console.error('College sync failed:', err.message); }
    }, config.COLLEGE_SYNC_MINUTES * 60 * 1000);
    timer.unref();
  }
}

module.exports = { syncFromCollege, startAutoSync, status, mapRow, parseCsv };
