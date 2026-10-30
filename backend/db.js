// db.js — opens the SQLite database file and creates the tables.
// SQLite is built into Node (node:sqlite), so there is nothing extra to install.
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const db = new DatabaseSync(config.DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS students (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    roll_no    TEXT UNIQUE NOT NULL,
    branch     TEXT NOT NULL,
    year       TEXT NOT NULL,
    email      TEXT,
    phone      TEXT,
    created_at TEXT NOT NULL DEFAULT (date('now'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    sku    TEXT UNIQUE NOT NULL,
    name   TEXT NOT NULL,
    season TEXT NOT NULL CHECK (season IN ('winter','summer')),
    price  INTEGER NOT NULL CHECK (price >= 0),
    stock  INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    image  TEXT
  );

  CREATE TABLE IF NOT EXISTS item_sizes (
    item_id  INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    size     TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, size)
  );

  CREATE TABLE IF NOT EXISTS requests (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id),
    item_id    INTEGER NOT NULL REFERENCES items(id),
    size       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','dispatched','rejected')),
    created_at TEXT NOT NULL DEFAULT (date('now'))
  );

  CREATE TABLE IF NOT EXISTS queries (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name         TEXT NOT NULL,
    roll_no           TEXT NOT NULL,
    branch            TEXT NOT NULL,
    year              TEXT NOT NULL,
    email             TEXT NOT NULL,
    phone             TEXT,
    category          TEXT NOT NULL,
    request_code      TEXT,
    subject           TEXT NOT NULL,
    message           TEXT NOT NULL,
    urgency           TEXT NOT NULL DEFAULT 'Low',
    admission_id      TEXT,
    attachment_path   TEXT,
    attachment_name   TEXT,
    status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Admission IDs: the list of IDs a student must enter to get into the Student Block.
  -- student_id links an ID to a student record (needed to request dresses).
  CREATE TABLE IF NOT EXISTS admission_ids (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    admission_id TEXT UNIQUE NOT NULL,
    student_id   INTEGER REFERENCES students(id) ON DELETE SET NULL,
    created_at   TEXT NOT NULL DEFAULT (date('now'))
  );
  -- One admission ID per student.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_admission_student
    ON admission_ids(student_id) WHERE student_id IS NOT NULL;
`);

// Upgrade databases created before admission IDs existed (adds the new column once).
if (!db.prepare('PRAGMA table_info(queries)').all().some((c) => c.name === 'admission_id')) {
  db.exec('ALTER TABLE queries ADD COLUMN admission_id TEXT');
}

// Students now also carry the college-database fields (section, branch code, academic year, where the record came from).
const studentCols = db.prepare('PRAGMA table_info(students)').all().map((c) => c.name);
for (const [col, ddl] of [['section', 'TEXT'], ['branch_code', 'TEXT'], ['academic_year', 'TEXT'], ['source', "TEXT NOT NULL DEFAULT 'manual'"]]) {
  if (!studentCols.includes(col)) db.exec(`ALTER TABLE students ADD COLUMN ${col} ${ddl}`);
}
db.exec('CREATE INDEX IF NOT EXISTS idx_students_group ON students(branch_code, section)');

module.exports = db;
