// auth.js — admin login: password hashing, tokens (JWT) and the "must be logged in" guard.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('./config');
const db = require('./db');
const s = require('./services');
const { HttpError } = s;

// Passwords are never stored as plain text. We store "salt:hash" (scrypt).
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), test);
}

// Creates the first admin account (from .env) if no admin exists yet.
function ensureAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (count === 0) {
    db.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)')
      .run(config.ADMIN_EMAIL.toLowerCase(), hashPassword(config.ADMIN_PASSWORD));
  }
}

function login(email, password) {
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw new HttpError(400, 'Email and password are required');
  }
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email.trim().toLowerCase());
  if (!admin || !verifyPassword(password, admin.password_hash)) {
    throw new HttpError(401, 'Invalid email or password');
  }
  const token = jwt.sign({ role: 'admin', id: admin.id, email: admin.email }, config.JWT_SECRET, { expiresIn: '8h' });
  return { token, role: 'admin', email: admin.email };
}

// Student login: the student types their admission ID, which must exist in the
// "Admission IDs" list that the admin maintains.
function studentLogin(admissionId) {
  if (typeof admissionId !== 'string' || !admissionId.trim()) throw new HttpError(400, 'Please enter your admission ID');
  const adm = s.findAdmission(admissionId);
  if (!adm) throw new HttpError(401, 'This admission ID is not registered. Check it again or contact the Dress Management office.');
  const token = jwt.sign({ role: 'student', aid: adm.id }, config.JWT_SECRET, { expiresIn: '8h' });
  return { token, role: 'student', admission_id: adm.admission_id, student: s.getStudentProfile(adm.student_id) };
}

// Reads the token and works out who is calling. Returns { role: 'admin' } or
// { role: 'student', admissionId, studentId }. Throws an HttpError if not allowed in.
function identify(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Login required');
  let payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Session expired, please log in again');
  }
  if (payload.role === 'admin') return { role: 'admin', id: payload.id, email: payload.email };
  if (payload.role === 'student') {
    // Re-check the database every time: if the admin deletes an admission ID, access ends immediately.
    const adm = s.findAdmissionByRowId(payload.aid);
    if (!adm) throw new HttpError(401, 'Your admission ID is no longer valid. Please log in again.');
    return { role: 'student', admissionId: adm.admission_id, studentId: adm.student_id };
  }
  throw new HttpError(401, 'Please log in again');
}

function guard(allowed) {
  return (req, res, next) => {
    try {
      const user = identify(req);
      if (!allowed.includes(user.role)) throw new HttpError(403, 'This area is for admins only');
      req.user = user;
      next();
    } catch (err) {
      res.status(err.status || 401).json({ error: err.message });
    }
  };
}

// Admins only: dashboard, requests list, students, query inbox, admission IDs.
const requireAdmin = guard(['admin']);
// Student Block routes: admins and logged-in students (dress catalog, requesting, query form).
const requireUser = guard(['admin', 'student']);

module.exports = { hashPassword, verifyPassword, ensureAdmin, login, studentLogin, identify, requireAdmin, requireUser };
