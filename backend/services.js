// services.js — the "brain" of the backend: all the rules and database queries.
// routes.js just calls these functions. If something is wrong we throw an HttpError.
const db = require('./db');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const STATUSES   = ['pending', 'approved', 'dispatched', 'rejected'];
const SEASONS    = ['winter', 'summer'];
const BRANCHES   = ['Computer Science', 'Information Tech.', 'Electronics', 'Mechanical', 'Civil', 'Other'];
const YEARS      = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const CATEGORIES = ['Dress Catalog', 'Request Status', 'Sizing & Exchange', 'Payment & Billing', 'Other'];
const URGENCIES  = ['Low', 'Medium', 'High'];

// Which status changes are allowed (pending -> approved -> dispatched).
const TRANSITIONS = {
  pending:    ['approved', 'rejected'],
  approved:   ['dispatched'],
  dispatched: [],
  rejected:   [],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Runs several database steps as one unit: all succeed or none are saved.
function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Trim text and limit its length. Non-text becomes an empty string.
function clean(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// ---------------------------------------------------------------- items
function listItems(season) {
  if (season && !SEASONS.includes(season)) throw new HttpError(400, 'season must be winter or summer');
  const items = season
    ? db.prepare('SELECT * FROM items WHERE season = ? ORDER BY sku').all(season)
    : db.prepare('SELECT * FROM items ORDER BY season DESC, sku').all();
  const sizeStmt = db.prepare('SELECT size FROM item_sizes WHERE item_id = ? ORDER BY position');
  return items.map((it) => ({ ...it, sizes: sizeStmt.all(it.id).map((s) => s.size) }));
}

// ------------------------------------------------------------ students
const STUDENT_SELECT = `
  SELECT s.*,
    (SELECT a.admission_id FROM admission_ids a WHERE a.student_id = s.id) AS admission_id,
    CASE
      WHEN EXISTS (SELECT 1 FROM requests r WHERE r.student_id = s.id AND r.status = 'dispatched') THEN 'Issued'
      WHEN EXISTS (SELECT 1 FROM requests r WHERE r.student_id = s.id AND r.status IN ('pending','approved')) THEN 'Pending'
      ELSE 'Not Issued'
    END AS issue_status
  FROM students s`;

// The catalog pictures live in Mini_Project/Dashboard/images/. An older database may point its items at other file
// names (or none), so at start-up every known item is pointed at the right picture again (by SKU, else name + season).
const ITEM_IMAGES = {
  'GLB-WT-001': 'woolen-grey-trousers.jpg', 'GLB-WT-002': 'red-tie.jpg', 'GLB-WT-003': 'navy-blue-blazer.jpg',
  'GLB-WT-004': 'grey-sweater.jpg', 'GLB-WT-005': 'sky-blue-shirt-winter.jpg',
  'GLB-SM-001': 'grey-trousers.jpg', 'GLB-SM-002': 'red-tie-summer.jpg', 'GLB-SM-003': 'sky-blue-shirt-summer.jpg',
};
const ITEM_IMAGES_BY_NAME = {
  'woolen grey trousers|winter': 'woolen-grey-trousers.jpg', 'red colored tie|winter': 'red-tie.jpg',
  'navy blue blazer|winter': 'navy-blue-blazer.jpg', 'grey sweater|winter': 'grey-sweater.jpg',
  'sky blue shirt|winter': 'sky-blue-shirt-winter.jpg', 'grey trousers|summer': 'grey-trousers.jpg',
  'red colored tie|summer': 'red-tie-summer.jpg', 'sky blue shirt|summer': 'sky-blue-shirt-summer.jpg',
};
function fixItemImages() {
  const set = db.prepare('UPDATE items SET image = ? WHERE id = ?');
  let changed = 0;
  for (const it of db.prepare('SELECT id, sku, name, season, image FROM items').all()) {
    const want = ITEM_IMAGES[it.sku] || ITEM_IMAGES_BY_NAME[`${String(it.name).toLowerCase()}|${it.season}`];
    if (want && want !== it.image) { set.run(want, it.id); changed++; }
  }
  return changed;
}

// Old records (created before branch codes / sections existed) get a code from their branch name and section A,
// so they show up in the Students > Branch > Section pages too.
const LEGACY_CODES = { 'Computer Science': 'CSE', 'Information Tech.': 'IT', Electronics: 'ECE', Mechanical: 'ME', Civil: 'CE', Other: 'OTH' };
function fillStudentGroups() {
  const rows = db.prepare("SELECT id, branch FROM students WHERE branch_code IS NULL OR branch_code = ''").all();
  const set = db.prepare('UPDATE students SET branch_code = ? WHERE id = ?');
  for (const r of rows) set.run(LEGACY_CODES[r.branch] || 'OTH', r.id);
  db.prepare("UPDATE students SET section = 'A' WHERE section IS NULL OR section = ''").run();
  return rows.length;
}

// "2026-27" -> "1st Year" (a student who joined in 2026 is in 1st year during the 2026-27 session).
const YEAR_LABELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
function yearLabel(academicYear, now = new Date()) {
  const start = parseInt(String(academicYear || ''), 10);
  if (!start) return '1st Year';
  const currentStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return YEAR_LABELS[Math.min(3, Math.max(0, currentStart - start))];
}

// Students that match the words typed in a search box: every word must match name, roll no, branch, code, section or admission ID.
function listStudents(search, branch, section) {
  const where = [];
  const args = [];
  const b = clean(branch, 20).toUpperCase();
  const sec = clean(section, 10).toUpperCase();
  if (b) { where.push('UPPER(s.branch_code) = ?'); args.push(b); }
  if (sec) { where.push('UPPER(s.section) = ?'); args.push(sec); }
  for (const word of clean(search, 80).split(/\s+/).filter(Boolean).slice(0, 6)) {
    const like = `%${word}%`;
    where.push(`(s.name LIKE ? OR s.roll_no LIKE ? OR s.branch LIKE ? OR s.branch_code LIKE ? OR s.section = ?
      OR EXISTS (SELECT 1 FROM admission_ids a WHERE a.student_id = s.id AND a.admission_id LIKE ?))`);
    args.push(like, like, like, like, word.toUpperCase(), like);
  }
  return db.prepare(STUDENT_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY s.branch_code, s.section, s.roll_no, s.id').all(...args);
}

// Branch -> sections tree for the Students pages. Branches exist because admins (or the college database) put students in them.
function listBranches() {
  fillStudentGroups();
  const rows = db.prepare(
    'SELECT branch_code, branch, section, COUNT(*) AS n FROM students GROUP BY branch_code, branch, section'
  ).all();
  const byCode = new Map();
  for (const r of rows) {
    let b = byCode.get(r.branch_code);
    if (!b) { b = { branch_code: r.branch_code, branch_name: r.branch, total: 0, sections: new Map() }; byCode.set(r.branch_code, b); }
    if (String(r.branch).length > b.branch_name.length) b.branch_name = r.branch; // prefer the full name
    b.total += r.n;
    b.sections.set(r.section, (b.sections.get(r.section) || 0) + r.n);
  }
  return [...byCode.values()]
    .map((b) => ({
      branch_code: b.branch_code, branch_name: b.branch_name, total: b.total,
      sections: [...b.sections].map(([section, count]) => ({ section, count })).sort((x, y) => x.section.localeCompare(y.section)),
    }))
    .sort((x, y) => x.branch_code.localeCompare(y.branch_code));
}

function getStudent(id) {
  const student = db.prepare(STUDENT_SELECT + ' WHERE s.id = ?').get(id);
  if (!student) throw new HttpError(404, 'Student not found');
  const requests = db.prepare(REQUEST_SELECT + ' WHERE r.student_id = ? ORDER BY r.id DESC').all(id);
  return { ...student, requests };
}

function createStudent(body = {}) {
  const s = {
    name:    clean(body.name, 100),
    roll_no: clean(body.roll_no, 20),
    branch:  clean(body.branch, 50),
    year:    clean(body.year, 20),
    email:   clean(body.email, 120),
    phone:   clean(body.phone, 15),
  };
  if (!s.name || !s.roll_no || !s.branch || !s.year) {
    throw new HttpError(400, 'Name, roll number, branch and year are required');
  }
  if (!/^[A-Za-z0-9-]{5,20}$/.test(s.roll_no)) throw new HttpError(400, 'Roll number must be 5-20 letters/digits');
  if (!BRANCHES.includes(s.branch)) throw new HttpError(400, 'Invalid branch');
  if (!YEARS.includes(s.year)) throw new HttpError(400, 'Invalid year');
  if (s.email && !EMAIL_RE.test(s.email)) throw new HttpError(400, 'Invalid email address');
  if (s.phone && !/^\d{10}$/.test(s.phone)) throw new HttpError(400, 'Phone must be 10 digits');

  try {
    const r = db.prepare(
      'INSERT INTO students (name, roll_no, branch, year, email, phone, branch_code, section) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(s.name, s.roll_no, s.branch, s.year, s.email || null, s.phone || null,
      LEGACY_CODES[s.branch] || 'OTH', clean(body.section, 5).toUpperCase() || 'A');
    return db.prepare(STUDENT_SELECT + ' WHERE s.id = ?').get(r.lastInsertRowid);
  } catch (err) {
    if (/UNIQUE/i.test(err.message)) throw new HttpError(409, 'A student with this roll number already exists');
    throw err;
  }
}

// Adds ONE student with the full college details (used by "Add Admission ID" -> New student).
// Unlike createStudent, the branch is free: admins can type a new branch code + name.
function addStudentRecord(body = {}) {
  const s = {
    name:          clean(body.name, 100),
    roll_no:       clean(body.roll_no, 30),
    branch_code:   clean(body.branch_code, 12).toUpperCase(),
    branch:        clean(body.branch_name || body.branch, 150),
    section:       clean(body.section, 5).toUpperCase(),
    year:          clean(body.year, 20),
    academic_year: clean(body.academic_year, 20),
    email:         clean(body.email, 120),
    phone:         clean(body.phone, 15),
  };
  if (!s.name || !s.roll_no || !s.branch_code || !s.section) {
    throw new HttpError(400, 'Name, roll number, branch and section are required');
  }
  if (!s.branch) s.branch = s.branch_code;
  if (!s.year) s.year = yearLabel(s.academic_year);
  if (!/^[A-Za-z0-9-]{5,30}$/.test(s.roll_no)) throw new HttpError(400, 'Roll number must be 5-30 letters, digits or dashes');
  if (!/^[A-Z0-9-]{2,12}$/.test(s.branch_code)) throw new HttpError(400, 'Branch code must be 2-12 letters or digits (e.g. CSE)');
  if (!/^[A-Z0-9]{1,5}$/.test(s.section)) throw new HttpError(400, 'Section must be 1-5 letters or digits (e.g. A)');
  if (!YEARS.includes(s.year)) throw new HttpError(400, 'Invalid year');
  if (s.email && !EMAIL_RE.test(s.email)) throw new HttpError(400, 'Invalid email address');
  if (s.phone && !/^\d{10}$/.test(s.phone)) throw new HttpError(400, 'Phone must be 10 digits');
  try {
    const r = db.prepare(
      `INSERT INTO students (name, roll_no, branch, year, email, phone, branch_code, section, academic_year, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`
    ).run(s.name, s.roll_no, s.branch, s.year, s.email || null, s.phone || null, s.branch_code, s.section, s.academic_year || null);
    return db.prepare(STUDENT_SELECT + ' WHERE s.id = ?').get(r.lastInsertRowid);
  } catch (err) {
    if (/UNIQUE/i.test(err.message)) throw new HttpError(409, 'A student with this roll number already exists');
    throw err;
  }
}

// ------------------------------------------------------------ requests
// Request IDs look like REQ-2025-001 (year of the request + the record number).
const REQUEST_SELECT = `
  SELECT r.id,
         'REQ-' || substr(r.created_at, 1, 4) || '-' || printf('%03d', r.id) AS request_code,
         s.name    AS student_name,
         s.roll_no AS roll_no,
         i.name    AS item_name,
         r.size    AS size,
         r.created_at AS date,
         r.status  AS status
  FROM requests r
  JOIN students s ON s.id = r.student_id
  JOIN items i    ON i.id = r.item_id`;

function listRequests(status) {
  if (status && !STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');
  return status
    ? db.prepare(REQUEST_SELECT + ' WHERE r.status = ? ORDER BY r.id DESC').all(status)
    : db.prepare(REQUEST_SELECT + ' ORDER BY r.id DESC').all();
}

// forcedStudentId is set when a logged-in STUDENT requests a dress: the request is always
// made for their own record, whatever roll number the browser sends.
function createRequest(body = {}, forcedStudentId = null) {
  const itemId = Number(body.item_id);
  const size = clean(body.size, 20);
  let studentId = forcedStudentId;
  if (studentId === null) {
    const rollNo = clean(body.roll_no, 20);
    if (!rollNo || !Number.isInteger(itemId) || !size) {
      throw new HttpError(400, 'Roll number, item and size are required');
    }
    const student = db.prepare('SELECT id FROM students WHERE roll_no = ?').get(rollNo);
    if (!student) throw new HttpError(404, `No student found with roll number ${rollNo}. Add the student first.`);
    studentId = student.id;
  } else if (!Number.isInteger(itemId) || !size) {
    throw new HttpError(400, 'Item and size are required');
  }
  const item = db.prepare('SELECT id, stock FROM items WHERE id = ?').get(itemId);
  if (!item) throw new HttpError(404, 'Item not found');
  const validSize = db.prepare('SELECT 1 FROM item_sizes WHERE item_id = ? AND size = ?').get(itemId, size);
  if (!validSize) throw new HttpError(400, 'That size is not available for this item');
  if (item.stock <= 0) throw new HttpError(409, 'This item is out of stock');

  const r = db.prepare('INSERT INTO requests (student_id, item_id, size) VALUES (?, ?, ?)')
    .run(studentId, itemId, size);
  return db.prepare(REQUEST_SELECT + ' WHERE r.id = ?').get(r.lastInsertRowid);
}

function updateRequestStatus(id, newStatus) {
  if (!STATUSES.includes(newStatus)) throw new HttpError(400, 'Invalid status');
  return transaction(() => {
    const req = db.prepare('SELECT id, item_id, status FROM requests WHERE id = ?').get(id);
    if (!req) throw new HttpError(404, 'Request not found');
    if (!TRANSITIONS[req.status].includes(newStatus)) {
      throw new HttpError(409, `A ${req.status} request cannot be changed to ${newStatus}`);
    }
    if (newStatus === 'dispatched') {
      // Handing over the dress reduces the stock by one.
      const upd = db.prepare('UPDATE items SET stock = stock - 1 WHERE id = ? AND stock > 0').run(req.item_id);
      if (upd.changes === 0) throw new HttpError(409, 'Cannot dispatch: item is out of stock');
    }
    db.prepare('UPDATE requests SET status = ? WHERE id = ?').run(newStatus, id);
    return db.prepare(REQUEST_SELECT + ' WHERE r.id = ?').get(id);
  });
}


function listStudentRequests(studentId) {
  if (!studentId) return [];
  return db.prepare(REQUEST_SELECT + ' WHERE r.student_id = ? ORDER BY r.id DESC').all(studentId);
}

function updateItemStock(id, body = {}) {
  const stock = Number(body.stock);
  const price = body.price === undefined ? null : Number(body.price);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid item id');
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) throw new HttpError(400, 'Stock must be a whole number from 0 to 100000');
  if (price !== null && (!Number.isInteger(price) || price < 0 || price > 10000000)) throw new HttpError(400, 'Price must be a non-negative whole number');
  const exists = db.prepare('SELECT id FROM items WHERE id = ?').get(id);
  if (!exists) throw new HttpError(404, 'Item not found');
  if (price === null) db.prepare('UPDATE items SET stock = ? WHERE id = ?').run(stock, id);
  else db.prepare('UPDATE items SET stock = ?, price = ? WHERE id = ?').run(stock, price, id);
  return listItems().find((item) => item.id === id);
}

// ----------------------------------------------------------- dashboard
function getDashboard() {
  const one = (sql) => db.prepare(sql).get().n;
  const stats = {
    totalItems:   one('SELECT COALESCE(SUM(stock), 0) AS n FROM items'),
    pending:      one("SELECT COUNT(*) AS n FROM requests WHERE status = 'pending'"),
    dispatched:   one("SELECT COUNT(*) AS n FROM requests WHERE status = 'dispatched'"),
    students:     one('SELECT COUNT(*) AS n FROM students'),
  };
  const recent = db.prepare(REQUEST_SELECT + ' ORDER BY r.created_at DESC, r.id DESC LIMIT 5').all();
  const stock = db.prepare(
    'SELECT name, SUM(stock) AS stock FROM items GROUP BY name ORDER BY stock DESC LIMIT 5'
  ).all();
  return { stats, recent, stock };
}

// ------------------------------------------------------------- queries
// student = the logged-in student's record (or null for an admin / unlinked ID).
// When a student record exists, their name, roll number, branch and year come from the
// database, so nobody can send a query in someone else's name.
function createQuery(body = {}, file, student = null, admissionId = null) {
  const q = {
    full_name:    clean(body.fullName, 100),
    roll_no:      clean(body.rollNo, 30),
    branch:       clean(body.branch, 50),
    year:         clean(body.year, 20),
    email:        clean(body.email, 120),
    phone:        clean(body.phone, 15),
    category:     clean(body.category, 40),
    request_code: clean(body.requestId, 30),
    subject:      clean(body.subject, 150),
    message:      clean(body.message, 3000),
    urgency:      clean(body.urgency, 10) || 'Low',
  };
  if (student) {
    q.full_name = student.name;
    q.roll_no = student.roll_no;
    q.branch = student.branch;
    q.year = student.year;
  }
  const required = ['full_name', 'roll_no', 'branch', 'year', 'email', 'category', 'subject', 'message'];
  if (required.some((k) => !q[k])) throw new HttpError(400, 'Please fill in all required fields');
  if (!EMAIL_RE.test(q.email)) throw new HttpError(400, 'Please enter a valid email address');
  if (q.phone && !/^\d{10}$/.test(q.phone)) throw new HttpError(400, 'Phone number must be 10 digits');
  if (!CATEGORIES.includes(q.category)) throw new HttpError(400, 'Invalid query category');
  if (!URGENCIES.includes(q.urgency)) throw new HttpError(400, 'Invalid urgency');
  if (!['on', 'true', '1', true].includes(body.consent)) throw new HttpError(400, 'Please tick the consent box');

  const r = db.prepare(`
    INSERT INTO queries (full_name, roll_no, branch, year, email, phone, category, request_code,
                         subject, message, urgency, attachment_path, attachment_name, admission_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(q.full_name, q.roll_no, q.branch, q.year, q.email, q.phone || null, q.category,
        q.request_code || null, q.subject, q.message, q.urgency,
        file ? file.path : null, file ? clean(file.originalname, 150) : null, admissionId || null);
  return { id: Number(r.lastInsertRowid), message: 'Your query has been submitted.' };
}

function listQueries(status) {
  if (status && !['open', 'resolved'].includes(status)) throw new HttpError(400, 'Invalid status');
  const cols = `id, full_name, roll_no, branch, year, email, phone, category, request_code, subject,
                message, urgency, admission_id, attachment_name, (attachment_path IS NOT NULL) AS has_attachment,
                status, created_at`;
  return status
    ? db.prepare(`SELECT ${cols} FROM queries WHERE status = ? ORDER BY id DESC`).all(status)
    : db.prepare(`SELECT ${cols} FROM queries ORDER BY id DESC`).all();
}

function updateQueryStatus(id, status) {
  if (!['open', 'resolved'].includes(status)) throw new HttpError(400, 'Invalid status');
  const r = db.prepare('UPDATE queries SET status = ? WHERE id = ?').run(status, id);
  if (r.changes === 0) throw new HttpError(404, 'Query not found');
  return { id, status };
}

function getQueryAttachment(id) {
  const row = db.prepare('SELECT attachment_path, attachment_name FROM queries WHERE id = ?').get(id);
  if (!row || !row.attachment_path) throw new HttpError(404, 'No attachment found');
  return row;
}

// ------------------------------------------------------- admission IDs
const ADMISSION_RE = /^[A-Z0-9-]{4,30}$/;
const normAdmission = (v) => clean(v, 30).toUpperCase();

const ADMISSION_SELECT = `
  SELECT a.id, a.admission_id, a.student_id, a.created_at,
         s.name AS student_name, s.roll_no AS roll_no, s.branch AS branch, s.year AS year,
         s.branch_code AS branch_code, s.section AS section, s.academic_year AS academic_year
  FROM admission_ids a
  LEFT JOIN students s ON s.id = a.student_id`;

// Every word typed must match something: ID, name, roll number, branch (name or code), section or year.
// Example: "cse a 0012" finds ADM-2026-0012 in CSE section A.
function listAdmissionIds(search) {
  const where = [];
  const args = [];
  for (const word of clean(search, 80).split(/\s+/).filter(Boolean).slice(0, 6)) {
    const like = `%${word}%`;
    where.push('(a.admission_id LIKE ? OR s.name LIKE ? OR s.roll_no LIKE ? OR s.branch LIKE ? OR s.branch_code LIKE ? OR s.section = ? OR s.year LIKE ?)');
    args.push(like, like, like, like, like, word.toUpperCase(), like);
  }
  return db.prepare(ADMISSION_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY a.id DESC').all(...args);
}

// Accepts a student id, or empty/null for "not linked". Returns a number or null.
function parseStudentLink(value) {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid student');
  if (!db.prepare('SELECT 1 FROM students WHERE id = ?').get(id)) throw new HttpError(404, 'Student not found');
  return id;
}

// Next free ID like ADM-2026-0097 (used when the admin leaves the ID empty, and by the college sync).
function nextAdmissionId(year = new Date().getFullYear()) {
  const prefix = `ADM-${year}-`;
  const rows = db.prepare('SELECT admission_id FROM admission_ids WHERE admission_id LIKE ?').all(prefix + '%');
  let n = rows.reduce((max, r) => Math.max(max, parseInt(r.admission_id.slice(prefix.length), 10) || 0), 0) + 1;
  while (db.prepare('SELECT 1 FROM admission_ids WHERE admission_id = ?').get(prefix + String(n).padStart(4, '0'))) n++;
  return prefix + String(n).padStart(4, '0');
}

// Two ways to add:
//  - link an existing student:   { admission_id, student_id }
//  - new student + ID together:  { name, roll_no, branch_code, branch_name, section, year, [admission_id] }
//    -> the student card appears automatically in Students > branch > section. An empty admission_id is generated.
function createAdmissionId(body = {}) {
  const isNew = !body.student_id && clean(body.name, 100) !== '';
  return transaction(() => {
    const studentId = isNew ? addStudentRecord(body).id : parseStudentLink(body.student_id);
    let admissionId = normAdmission(body.admission_id);
    if (!admissionId && isNew) admissionId = nextAdmissionId();
    if (!admissionId) throw new HttpError(400, 'Admission ID is required');
    if (!ADMISSION_RE.test(admissionId)) throw new HttpError(400, 'Admission ID must be 4-30 letters, digits or dashes');
    try {
      const r = db.prepare('INSERT INTO admission_ids (admission_id, student_id) VALUES (?, ?)').run(admissionId, studentId);
      return db.prepare(ADMISSION_SELECT + ' WHERE a.id = ?').get(r.lastInsertRowid);
    } catch (err) {
      if (/UNIQUE/i.test(err.message) && /student_id/i.test(err.message)) throw new HttpError(409, 'That student already has an admission ID');
      if (/UNIQUE/i.test(err.message)) throw new HttpError(409, 'This admission ID already exists');
      throw err;
    }
  });
}

// Link an admission ID to a student (or unlink with an empty value).
function updateAdmissionId(id, body = {}) {
  if (!db.prepare('SELECT 1 FROM admission_ids WHERE id = ?').get(id)) throw new HttpError(404, 'Admission ID not found');
  const studentId = parseStudentLink(body.student_id);
  try {
    db.prepare('UPDATE admission_ids SET student_id = ? WHERE id = ?').run(studentId, id);
  } catch (err) {
    if (/UNIQUE/i.test(err.message)) throw new HttpError(409, 'That student already has an admission ID');
    throw err;
  }
  return db.prepare(ADMISSION_SELECT + ' WHERE a.id = ?').get(id);
}

function deleteAdmissionId(id) {
  const r = db.prepare('DELETE FROM admission_ids WHERE id = ?').run(id);
  if (r.changes === 0) throw new HttpError(404, 'Admission ID not found');
  return { id, deleted: true };
}

// Used at student login and on every student request. Returns null if the ID does not exist.
function findAdmission(admissionId) {
  const id = normAdmission(admissionId);
  if (!id) return null;
  return db.prepare('SELECT id, admission_id, student_id FROM admission_ids WHERE admission_id = ?').get(id)
    || db.prepare("SELECT id, admission_id, student_id FROM admission_ids WHERE REPLACE(admission_id, '-', '') = ?").get(id.replace(/-/g, ''))
    || null;
}

function findAdmissionByRowId(rowId) {
  return db.prepare('SELECT id, admission_id, student_id FROM admission_ids WHERE id = ?').get(rowId) || null;
}

function getStudentProfile(studentId) {
  if (!studentId) return null;
  return db.prepare('SELECT id, name, roll_no, branch, year, email, phone, branch_code, section FROM students WHERE id = ?').get(studentId) || null;
}

// Databases created before this feature have no admission IDs: give every existing student one
// (ADM2025 + their record number) so nobody is locked out. Admins can edit them afterwards.
function backfillAdmissionIds() {
  if (db.prepare('SELECT COUNT(*) AS n FROM admission_ids').get().n > 0) return 0;
  const students = db.prepare('SELECT id FROM students ORDER BY id').all();
  const add = db.prepare('INSERT INTO admission_ids (admission_id, student_id) VALUES (?, ?)');
  students.forEach((st) => add.run('ADM2025' + String(st.id).padStart(3, '0'), st.id));
  return students.length;
}

module.exports = {
  HttpError, transaction,
  listItems, listStudents, listBranches, getStudent, createStudent, addStudentRecord, fillStudentGroups, fixItemImages, yearLabel, nextAdmissionId,
  listRequests, listStudentRequests, createRequest, updateRequestStatus, updateItemStock,
  getDashboard,
  createQuery, listQueries, updateQueryStatus, getQueryAttachment,
  listAdmissionIds, createAdmissionId, updateAdmissionId, deleteAdmissionId,
  findAdmission, findAdmissionByRowId, getStudentProfile, backfillAdmissionIds,
};
