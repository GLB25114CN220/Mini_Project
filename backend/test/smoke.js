// Quick self-test of the backend logic (uses a temporary in-memory database).
// Run with:  npm test
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const { seed } = require('../seed');
const s = require('../services');
const { login, studentLogin, identify, requireAdmin, requireUser, verifyPassword, hashPassword } = require('../auth');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };
const fails = (fn, status) => {
  try { fn(); } catch (e) { assert.strictEqual(e.status, status, `expected ${status}, got ${e.status}: ${e.message}`); return; }
  assert.fail('expected an error');
};

seed();

test('catalog: 8 items, 5 winter, 3 summer, sizes in order', () => {
  assert.strictEqual(s.listItems().length, 8);
  assert.strictEqual(s.listItems('winter').length, 5);
  assert.strictEqual(s.listItems('summer').length, 3);
  assert.deepStrictEqual(s.listItems('winter').find((i) => i.sku === 'GLB-WT-003').sizes, ['S', 'M', 'L', 'XL']);
  fails(() => s.listItems('spring'), 400);
});

test('dashboard numbers match the data', () => {
  const d = s.getDashboard();
  assert.strictEqual(d.stats.students, 8);
  assert.strictEqual(d.stats.pending, 2);
  assert.strictEqual(d.stats.dispatched, 1);
  assert.strictEqual(d.recent.length, 5);
  assert.strictEqual(d.recent[0].request_code, 'REQ-2025-006');
  assert.ok(d.stock.length <= 5);
});

test('requests filtered by status + REQ code format', () => {
  assert.strictEqual(s.listRequests().length, 6);
  assert.strictEqual(s.listRequests('pending').length, 2);
  assert.strictEqual(s.listRequests('approved').length, 2);
  assert.ok(s.listRequests().some((r) => r.request_code === 'REQ-2025-001'));
  fails(() => s.listRequests('bogus'), 400);
});

test('students: list, search, status label, details', () => {
  assert.strictEqual(s.listStudents().length, 8);
  assert.strictEqual(s.listStudents('aryan').length, 1);
  assert.strictEqual(s.listStudents('Mechanical').length, 2);
  const priya = s.listStudents('Priya')[0];
  assert.strictEqual(priya.issue_status, 'Issued');
  assert.strictEqual(s.listStudents('Karan')[0].issue_status, 'Not Issued');
  assert.strictEqual(s.getStudent(priya.id).requests.length, 1);
  fails(() => s.getStudent(9999), 404);
});

test('add student: validation + duplicate roll number', () => {
  const st = s.createStudent({ name: 'Test User', roll_no: '2100980399999', branch: 'Civil', year: '1st Year', email: 't@glbajaj.ac.in', phone: '9876543210' });
  assert.strictEqual(st.issue_status, 'Not Issued');
  fails(() => s.createStudent({ name: 'Dup', roll_no: '2100980399999', branch: 'Civil', year: '1st Year' }), 409);
  fails(() => s.createStudent({ name: '', roll_no: '2100980399998', branch: 'Civil', year: '1st Year' }), 400);
  fails(() => s.createStudent({ name: 'X', roll_no: 'ab', branch: 'Civil', year: '1st Year' }), 400);
  fails(() => s.createStudent({ name: 'X', roll_no: '12345678', branch: 'Space', year: '1st Year' }), 400);
  fails(() => s.createStudent({ name: 'X', roll_no: '12345678', branch: 'Civil', year: '1st Year', phone: '123' }), 400);
});

test('create request: checks student, size, item', () => {
  const blazer = s.listItems('winter').find((i) => i.sku === 'GLB-WT-003');
  const r = s.createRequest({ roll_no: '2100980399999', item_id: blazer.id, size: 'M' });
  assert.strictEqual(r.status, 'pending');
  assert.strictEqual(r.student_name, 'Test User');
  fails(() => s.createRequest({ roll_no: '000000000', item_id: blazer.id, size: 'M' }), 404);
  fails(() => s.createRequest({ roll_no: '2100980399999', item_id: blazer.id, size: '99' }), 400);
  fails(() => s.createRequest({ roll_no: '2100980399999', item_id: 9999, size: 'M' }), 404);
  fails(() => s.createRequest({}), 400);
});

test('status flow: approve -> dispatch reduces stock; bad transitions blocked', () => {
  const blazer = () => s.listItems('winter').find((i) => i.sku === 'GLB-WT-003');
  const before = blazer().stock;
  const req = s.listRequests('pending').find((r) => r.item_name === 'Navy Blue Blazer' && r.roll_no === '2100980399999');
  fails(() => s.updateRequestStatus(req.id, 'dispatched'), 409);   // can't skip approval
  assert.strictEqual(s.updateRequestStatus(req.id, 'approved').status, 'approved');
  assert.strictEqual(blazer().stock, before);                     // approve doesn't change stock
  assert.strictEqual(s.updateRequestStatus(req.id, 'dispatched').status, 'dispatched');
  assert.strictEqual(blazer().stock, before - 1);                 // dispatch does
  fails(() => s.updateRequestStatus(req.id, 'rejected'), 409);    // final state
  fails(() => s.updateRequestStatus(9999, 'approved'), 404);
  fails(() => s.updateRequestStatus(req.id, 'nonsense'), 400);
});

test('reject flow', () => {
  const p = s.listRequests('pending')[0];
  assert.strictEqual(s.updateRequestStatus(p.id, 'rejected').status, 'rejected');
});

test('out of stock blocks new requests and dispatch', () => {
  const db = require('../db');
  const tie = s.listItems('summer').find((i) => i.sku === 'GLB-SM-002');
  const a = s.createRequest({ roll_no: '2100980310001', item_id: tie.id, size: 'Standard' });
  s.updateRequestStatus(a.id, 'approved');
  db.prepare('UPDATE items SET stock = 0 WHERE id = ?').run(tie.id);
  fails(() => s.updateRequestStatus(a.id, 'dispatched'), 409);
  assert.strictEqual(s.listRequests('approved').some((r) => r.id === a.id), true); // rolled back, still approved
  fails(() => s.createRequest({ roll_no: '2100980310001', item_id: tie.id, size: 'Standard' }), 409);
});

test('student queries: validate, save, list, resolve', () => {
  const good = { fullName: 'Aryan Sharma', rollNo: '2100980310001', branch: 'Computer Science', year: '3rd Year',
    email: 'a@glbajaj.ac.in', category: 'Request Status', subject: 'Where is my shirt?', message: 'Please update me.',
    urgency: 'High', consent: 'on' };
  const saved = s.createQuery(good, { path: '/tmp/x', originalname: 'receipt.pdf' });
  assert.ok(saved.id > 0);
  fails(() => s.createQuery({ ...good, consent: undefined }), 400);
  fails(() => s.createQuery({ ...good, email: 'nope' }), 400);
  fails(() => s.createQuery({ ...good, category: 'Hack' }), 400);
  fails(() => s.createQuery({ ...good, subject: '' }), 400);
  assert.strictEqual(s.listQueries('open').length, 1);
  assert.strictEqual(s.listQueries()[0].has_attachment, 1);
  assert.strictEqual(s.getQueryAttachment(saved.id).attachment_name, 'receipt.pdf');
  s.updateQueryStatus(saved.id, 'resolved');
  assert.strictEqual(s.listQueries('resolved').length, 1);
  fails(() => s.updateQueryStatus(9999, 'resolved'), 404);
});

test('SQL injection text is treated as plain text', () => {
  assert.strictEqual(s.listStudents("x' OR '1'='1").length, 0);
});

test('passwords are hashed and verified', () => {
  const h = hashPassword('secret');
  assert.ok(!h.includes('secret'));
  assert.ok(verifyPassword('secret', h));
  assert.ok(!verifyPassword('wrong', h));
});

test('login accepts the admin and rejects wrong passwords', () => {
  const out = login('ADMIN@glbajaj.ac.in', 'admin123');
  assert.ok(out.token);
  fails(() => login('admin@glbajaj.ac.in', 'wrong'), 401);
  fails(() => login('nobody@x.com', 'admin123'), 401);
  fails(() => login('', ''), 400);
});

// ------------------------------------------------ admission IDs + roles
const fakeReq = (token) => ({ headers: token ? { authorization: 'Bearer ' + token } : {} });
// Runs a guard middleware and reports what it did: { next: true } or { status, error }.
const runGuard = (guard, token) => {
  let out = { next: false };
  guard(fakeReq(token), { status(c) { out.status = c; return this; }, json(b) { out.error = b.error; } }, () => { out.next = true; });
  return out;
};

test('admission IDs: seeded, searchable, linked to students', () => {
  assert.strictEqual(s.listAdmissionIds().length, 8);
  assert.strictEqual(s.listAdmissionIds('ADM2025003')[0].student_name, 'Rohan Gupta');
  assert.strictEqual(s.listAdmissionIds('priya').length, 1);
});

test('admission IDs: add, duplicate, validation, link/unlink, delete', () => {
  const stu = s.createStudent({ name: 'Link Me', roll_no: '2100980377777', branch: 'Civil', year: '2nd Year' });
  const a = s.createAdmissionId({ admission_id: ' adm-9001 ' });
  assert.strictEqual(a.admission_id, 'ADM-9001');            // trimmed + upper-cased
  assert.strictEqual(a.student_id, null);
  fails(() => s.createAdmissionId({ admission_id: 'adm-9001' }), 409);
  fails(() => s.createAdmissionId({ admission_id: '' }), 400);
  fails(() => s.createAdmissionId({ admission_id: 'a b!' }), 400);
  fails(() => s.createAdmissionId({ admission_id: 'ADM-9002', student_id: 99999 }), 404);
  assert.strictEqual(s.updateAdmissionId(a.id, { student_id: stu.id }).student_name, 'Link Me');
  fails(() => s.createAdmissionId({ admission_id: 'ADM-9003', student_id: stu.id }), 409); // one ID per student
  assert.strictEqual(s.updateAdmissionId(a.id, { student_id: '' }).student_id, null);
  fails(() => s.updateAdmissionId(99999, {}), 404);
  assert.deepStrictEqual(s.deleteAdmissionId(a.id), { id: a.id, deleted: true });
  fails(() => s.deleteAdmissionId(a.id), 404);
});

test('student login: valid ID works (any letter case), unknown ID is refused', () => {
  const out = studentLogin('adm2025001');
  assert.ok(out.token);
  assert.strictEqual(out.role, 'student');
  assert.strictEqual(out.student.name, 'Aryan Sharma');
  fails(() => studentLogin('ADM-NOPE-1'), 401);
  fails(() => studentLogin('   '), 400);
  fails(() => studentLogin(undefined), 400);
});

test('roles: students reach the Student Block only; admins reach everything', () => {
  const student = studentLogin('ADM2025002').token;
  const admin = login('admin@glbajaj.ac.in', 'admin123').token;
  assert.ok(runGuard(requireUser, student).next);             // catalog / query form
  assert.ok(runGuard(requireUser, admin).next);
  assert.ok(runGuard(requireAdmin, admin).next);              // dashboard, requests, students, inbox, admission IDs
  const blocked = runGuard(requireAdmin, student);
  assert.strictEqual(blocked.next, false);
  assert.strictEqual(blocked.status, 403);
  assert.strictEqual(runGuard(requireUser, null).status, 401);       // no login
  assert.strictEqual(runGuard(requireAdmin, 'garbage').status, 401); // forged token
});

test('deleting an admission ID ends that student\'s session at once', () => {
  const a = s.createAdmissionId({ admission_id: 'TEMP-0001' });
  const token = studentLogin('TEMP-0001').token;
  assert.strictEqual(identify(fakeReq(token)).role, 'student');
  s.deleteAdmissionId(a.id);
  assert.strictEqual(runGuard(requireUser, token).status, 401);
});

test('student requests are always made for their own record', () => {
  const user = identify(fakeReq(studentLogin('ADM2025006').token));   // Ananya Joshi
  const shirt = s.listItems('winter').find((i) => i.sku === 'GLB-WT-005');
  const r = s.createRequest({ item_id: shirt.id, size: 'M', roll_no: '2100980310001' /* someone else: ignored */ }, user.studentId);
  assert.strictEqual(r.student_name, 'Ananya Joshi');
  assert.strictEqual(r.roll_no, '2100980320055');
  fails(() => s.createRequest({ item_id: shirt.id, size: '99' }, user.studentId), 400);
  fails(() => s.createRequest({ size: 'M' }, user.studentId), 400);
});

test('student queries: identity comes from the admission ID, not the form', () => {
  const user = identify(fakeReq(studentLogin('ADM2025004').token));   // Neha Verma
  const profile = s.getStudentProfile(user.studentId);
  const saved = s.createQuery({ fullName: 'Someone Else', rollNo: '999999999', branch: 'Other', year: '4th Year',
    email: 'n@glbajaj.ac.in', category: 'Other', subject: 'Hi', message: 'Hello', consent: 'on' }, null, profile, user.admissionId);
  const row = s.listQueries().find((q) => q.id === saved.id);
  assert.strictEqual(row.full_name, 'Neha Verma');
  assert.strictEqual(row.roll_no, '2100980320091');
  assert.strictEqual(row.admission_id, 'ADM2025004');
});

test('old databases get admission IDs created automatically', () => {
  const db = require('../db');
  db.exec('DELETE FROM admission_ids');
  const n = s.backfillAdmissionIds();
  assert.ok(n >= 8);
  assert.strictEqual(s.backfillAdmissionIds(), 0);            // does nothing the second time
  assert.ok(s.findAdmission('ADM2025001'));
});

test('old database items are pointed at the right catalog pictures', () => {
  const db = require('../db');
  db.prepare("UPDATE items SET image = 'old_name.png' WHERE sku = 'GLB-WT-004'").run();
  db.prepare("UPDATE items SET image = NULL, sku = 'LEGACY-1' WHERE sku = 'GLB-SM-003'").run();   // renamed SKU: matched by name + season
  assert.strictEqual(s.fixItemImages(), 2);
  const img = (name, season) => s.listItems(season).find((i) => i.name === name).image;
  assert.strictEqual(img('Grey Sweater', 'winter'), 'grey-sweater.jpg');
  assert.strictEqual(img('Sky Blue Shirt', 'summer'), 'sky-blue-shirt-summer.jpg');
  assert.strictEqual(s.fixItemImages(), 0);
});

test('college database sync: students + admission IDs, branches/sections, search, idempotent', () => {
  const college = require('../college_sync');
  const before = s.listStudents().length;
  const r = college.syncFromCollege();
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.total, 96);
  assert.strictEqual(r.students_created, 96);
  assert.strictEqual(r.ids_created, 96);
  assert.strictEqual(r.conflicts, 0);
  assert.strictEqual(s.listStudents().length, before + 96);

  const tree = s.listBranches();
  const cse = tree.find((b) => b.branch_code === 'CSE');
  assert.ok(cse && cse.sections.map((x) => x.section).join() === 'A,B');
  assert.ok(cse.total >= 16);
  assert.strictEqual(s.listStudents('', 'CSE-DS', 'B').length, 8);
  assert.strictEqual(s.listStudents('', 'cse-ds', 'b').length, 8);           // case does not matter
  const kabir = s.listStudents('Kabir Agarwal')[0];
  assert.strictEqual(kabir.admission_id, 'ADM-2026-0017');
  assert.strictEqual(kabir.year, '1st Year');
  assert.strictEqual(s.listAdmissionIds('ADM-2026-0017')[0].student_name, 'Kabir Agarwal');
  assert.strictEqual(s.listAdmissionIds('cse-ds a 0017')[0].admission_id, 'ADM-2026-0017'); // several words at once
  assert.strictEqual(s.findAdmission('adm20260017').admission_id, 'ADM-2026-0017');          // typed without dashes

  const again = college.syncFromCollege();                                   // second run changes nothing
  assert.strictEqual(again.students_created, 0);
  assert.strictEqual(again.ids_created, 0);
  assert.strictEqual(s.listStudents().length, before + 96);
});

test('add admission ID with a NEW student creates the card; auto-generates the ID', () => {
  const a = s.createAdmissionId({ name: 'Zoya Khan', roll_no: 'GLB26-CSE-A-099', branch_code: 'cse', branch_name: 'Computer Science and Engineering', section: 'a', year: '1st Year' });
  assert.ok(/^ADM-\d{4}-\d{4}$/.test(a.admission_id));
  assert.strictEqual(a.branch_code, 'CSE');
  assert.strictEqual(a.section, 'A');
  assert.strictEqual(s.listStudents('', 'CSE', 'A').some((x) => x.name === 'Zoya Khan' && x.admission_id === a.admission_id), true);
  fails(() => s.createAdmissionId({ name: 'Dup', roll_no: 'GLB26-CSE-A-099', branch_code: 'CSE', section: 'A', year: '1st Year' }), 409);
  const n = s.listAdmissionIds().length;
  fails(() => s.createAdmissionId({ name: 'Bad ID', roll_no: 'GLB26-CSE-A-098', branch_code: 'CSE', section: 'A', year: '1st Year', admission_id: a.admission_id }), 409);
  assert.strictEqual(s.listAdmissionIds().length, n);                        // failed add leaves no half-created student
  assert.strictEqual(s.listStudents('GLB26-CSE-A-098').length, 0);
  const fresh = s.createAdmissionId({ name: 'New Branch Kid', roll_no: 'GLB26-AI-A-001', branch_code: 'AIML', branch_name: 'AI and ML', section: 'A', year: '1st Year', admission_id: 'adm-2026-5000' });
  assert.strictEqual(fresh.admission_id, 'ADM-2026-5000');
  assert.ok(s.listBranches().some((b) => b.branch_code === 'AIML'));        // a brand-new branch appears by itself
});

console.log(`\n${passed} tests passed`);
