// seed.js — fills the database with the sample data that was in your HTML pages.
//   - The server runs this automatically the first time (empty database).
//   - To reset everything to the sample data, run:  npm run seed   (this ERASES current data!)
const db = require('./db');
const { transaction } = require('./services');
const { ensureAdmin } = require('./auth');

const ITEMS = [
  // sku,          name,                  season,   price, stock, image,                       sizes
  ['GLB-WT-001', 'Woolen Grey Trousers', 'winter', 750,  88,  'woolen-grey-trousers.jpg',   ['28', '30', '32', '34', '36']],
  ['GLB-WT-002', 'Red Colored Tie',      'winter', 150,  200, 'red-tie.jpg',                ['Standard']],
  ['GLB-WT-003', 'Navy Blue Blazer',     'winter', 1800, 40,  'navy-blue-blazer.jpg',       ['S', 'M', 'L', 'XL']],
  ['GLB-WT-004', 'Grey Sweater',         'winter', 950,  65,  'grey-sweater.jpg',           ['S', 'M', 'L', 'XL', 'XXL']],
  ['GLB-WT-005', 'Sky Blue Shirt',       'winter', 500,  130, 'sky-blue-shirt-winter.jpg',  ['S', 'M', 'L', 'XL', 'XXL']],
  ['GLB-SM-001', 'Grey Trousers',        'summer', 600,  110, 'grey-trousers.jpg',          ['28', '30', '32', '34', '36']],
  ['GLB-SM-002', 'Red Colored Tie',      'summer', 150,  200, 'red-tie-summer.jpg',         ['Standard']],
  ['GLB-SM-003', 'Sky Blue Shirt',       'summer', 450,  150, 'sky-blue-shirt-summer.jpg',  ['S', 'M', 'L', 'XL', 'XXL']],
];

const STUDENTS = [
  // name,            roll_no,         branch,              year
  ['Aryan Sharma',  '2100980310001', 'Computer Science',  '3rd Year'],
  ['Priya Singh',   '2100980320042', 'Electronics',       '2nd Year'],
  ['Rohan Gupta',   '2100980310078', 'Mechanical',        '4th Year'],
  ['Neha Verma',    '2100980320091', 'Civil',             '1st Year'],
  ['Karan Mehta',   '2100980310120', 'Computer Science',  '2nd Year'],
  ['Ananya Joshi',  '2100980320055', 'Information Tech.', '3rd Year'],
  ['Vikas Yadav',   '2100980310200', 'Mechanical',        '1st Year'],
  ['Divya Rao',     '2100980320130', 'Electronics',       '4th Year'],
];

// Admission IDs (one per sample student, in the same order as STUDENTS above).
// Students type one of these on the first page to enter the Student Block.
const ADMISSION_IDS = ['ADM2025001', 'ADM2025002', 'ADM2025003', 'ADM2025004',
                       'ADM2025005', 'ADM2025006', 'ADM2025007', 'ADM2025008'];

const REQUESTS = [
  // roll_no,         sku,          size, status,       date
  ['2100980310001', 'GLB-WT-005', 'L',        'approved',   '2025-08-10'],
  ['2100980320042', 'GLB-WT-002', 'Standard', 'dispatched', '2025-08-11'],
  ['2100980310078', 'GLB-WT-003', 'L',        'pending',    '2025-08-12'],
  ['2100980320091', 'GLB-WT-004', 'M',        'pending',    '2025-08-12'],
  ['2100980310120', 'GLB-SM-001', '32',       'rejected',   '2025-08-13'],
  ['2100980320055', 'GLB-SM-003', 'S',        'approved',   '2025-08-14'],
];

function seed() {
  transaction(() => {
    for (const t of ['requests', 'queries', 'item_sizes', 'items', 'admission_ids', 'students']) db.exec(`DELETE FROM ${t}`);
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('requests','queries','items','admission_ids','students')");

    const addItem = db.prepare('INSERT INTO items (sku, name, season, price, stock, image) VALUES (?, ?, ?, ?, ?, ?)');
    const addSize = db.prepare('INSERT INTO item_sizes (item_id, size, position) VALUES (?, ?, ?)');
    for (const [sku, name, season, price, stock, image, sizes] of ITEMS) {
      const id = addItem.run(sku, name, season, price, stock, image).lastInsertRowid;
      sizes.forEach((size, i) => addSize.run(id, size, i));
    }

    const addStudent = db.prepare('INSERT INTO students (name, roll_no, branch, year) VALUES (?, ?, ?, ?)');
    STUDENTS.forEach((s) => addStudent.run(...s));

    const addAdmission = db.prepare('INSERT INTO admission_ids (admission_id, student_id) VALUES (?, ?)');
    const byRoll = db.prepare('SELECT id FROM students WHERE roll_no = ?');
    STUDENTS.forEach((s, i) => addAdmission.run(ADMISSION_IDS[i], byRoll.get(s[1]).id));

    const studentId = db.prepare('SELECT id FROM students WHERE roll_no = ?');
    const itemId = db.prepare('SELECT id FROM items WHERE sku = ?');
    const addRequest = db.prepare(
      'INSERT INTO requests (student_id, item_id, size, status, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    for (const [roll, sku, size, status, date] of REQUESTS) {
      addRequest.run(studentId.get(roll).id, itemId.get(sku).id, size, status, date);
    }
  });
  ensureAdmin();
  require('./services').fillStudentGroups();
}

module.exports = { seed };

// Run directly with "npm run seed"
if (require.main === module) {
  seed();
  console.log('Database reset with sample data.');
}
