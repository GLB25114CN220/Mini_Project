// routes.js — the list of API addresses (endpoints) the frontend can call.
const fs = require('fs');
const express = require('express');
const multer = require('multer');

const config = require('./config');
const s = require('./services');
const { HttpError } = s;
const { login, studentLogin, requireAdmin, requireUser } = require('./auth');
const college = require('./college_sync');

const router = express.Router();

// Sends an error back to the browser as JSON.
function sendError(res, err) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}

// Wraps a handler so any error is turned into a proper JSON response.
const handle = (fn, status = 200) => (req, res) => {
  try {
    res.status(status).json(fn(req));
  } catch (err) {
    sendError(res, err);
  }
};

const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid id');
  return id;
};

// Slows down password / admission-ID guessing: max 10 login attempts per minute per address.
const attempts = new Map();
function limitLogins(req, res, next) {
  const now = Date.now();
  const recent = (attempts.get(req.ip) || []).filter((t) => now - t < 60 * 1000);
  if (recent.length >= 10) {
    return res.status(429).json({ error: 'Too many attempts. Please wait a minute and try again.' });
  }
  recent.push(now);
  attempts.set(req.ip, recent);
  next();
}

// -------------------------------------------------------------- PUBLIC (no login)
// Admins Block login (email + password)
router.post('/auth/login', limitLogins, handle((req) => login(req.body.email, req.body.password)));
// Student Block login (admission ID that exists in the Admission IDs list)
router.post('/auth/student-login', limitLogins, handle((req) => studentLogin(req.body.admission_id)));

// ------------------------------------- STUDENT BLOCK (logged-in student OR admin)
// Who am I? Used by the pages to show the right menu and pre-fill the query form.
router.get('/auth/me', requireUser, handle((req) => {
  if (req.user.role === 'admin') return { role: 'admin', email: req.user.email };
  return { role: 'student', admission_id: req.user.admissionId, student: s.getStudentProfile(req.user.studentId) };
}));

// Student's own data (an admin has no student record, so these return empty results for admins).
router.get('/student/profile', requireUser, handle((req) => (
  req.user.role === 'student' ? s.getStudentProfile(req.user.studentId) : null
)));
router.get('/student/requests', requireUser, handle((req) => (
  req.user.role === 'student' ? s.listStudentRequests(req.user.studentId) : []
)));

// Dress catalog
router.get('/items', requireUser, handle((req) => s.listItems(req.query.season)));

// Request a dress. A student always requests for their OWN record (taken from the admission ID).
router.post('/requests', requireUser, handle((req) => {
  if (req.user.role === 'student') {
    if (!req.user.studentId) {
      throw new HttpError(409, 'Your admission ID is not linked to a student record yet. Please ask the Dress Management office.');
    }
    return s.createRequest(req.body, req.user.studentId);
  }
  return s.createRequest(req.body);
}, 201));

// Student query form. Optional file: field name "attachment".
const upload = multer({
  dest: config.UPLOAD_DIR,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
    cb(ok ? null : new HttpError(400, 'Only images or PDF files are allowed'), ok);
  },
});

router.post('/queries', requireUser, (req, res) => {
  upload.single('attachment')(req, res, (uploadErr) => {
    if (uploadErr) {
      const err = uploadErr.code === 'LIMIT_FILE_SIZE' ? new HttpError(400, 'File is too large (max 5 MB)') : uploadErr;
      return sendError(res, err);
    }
    try {
      const isStudent = req.user.role === 'student';
      const student = isStudent ? s.getStudentProfile(req.user.studentId) : null;
      res.status(201).json(s.createQuery(req.body, req.file, student, isStudent ? req.user.admissionId : null));
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {}); // don't keep the file if the form was invalid
      sendError(res, err);
    }
  });
});

// ------------------------------------------------- ADMINS BLOCK (admin login only)
router.use(requireAdmin);

router.get('/dashboard',            handle(() => s.getDashboard()));

router.get('/students/branches',    handle(() => s.listBranches()));   // before /students/:id on purpose
router.get('/students',             handle((req) => s.listStudents(req.query.search, req.query.branch, req.query.section)));
router.post('/students',            handle((req) => s.createStudent(req.body), 201));
router.get('/students/:id',         handle((req) => s.getStudent(idParam(req))));

router.get('/requests',             handle((req) => s.listRequests(req.query.status)));
router.patch('/items/:id/inventory', handle((req) => s.updateItemStock(idParam(req), req.body)));
router.patch('/requests/:id/status', handle((req) => s.updateRequestStatus(idParam(req), req.body.status)));

router.get('/queries',              handle((req) => s.listQueries(req.query.status)));
router.patch('/queries/:id/status', handle((req) => s.updateQueryStatus(idParam(req), req.body.status)));
router.get('/queries/:id/attachment', (req, res) => {
  try {
    const file = s.getQueryAttachment(idParam(req));
    res.download(file.attachment_path, file.attachment_name || 'attachment');
  } catch (err) {
    sendError(res, err);
  }
});

// College app database -> students + admission IDs
router.get('/college/status',       handle(() => college.status()));
router.post('/college/sync',        handle(() => college.syncFromCollege({ force: true })));

router.get('/admission-ids',        handle((req) => s.listAdmissionIds(req.query.search)));
router.post('/admission-ids',       handle((req) => s.createAdmissionId(req.body), 201));
router.patch('/admission-ids/:id',  handle((req) => s.updateAdmissionId(idParam(req), req.body)));
router.delete('/admission-ids/:id', handle((req) => s.deleteAdmissionId(idParam(req))));

module.exports = router;
