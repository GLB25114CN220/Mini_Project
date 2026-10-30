// server.js — START HERE. Run with:  npm start
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const config = require('./config');
const db = require('./db');
const { ensureAdmin } = require('./auth');
const { seed } = require('./seed');
const { backfillAdmissionIds } = require('./services');
const routes = require('./routes');
const { startAutoSync } = require('./college_sync');

fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });

// First run: fill the empty database with the sample data from your frontend.
if (db.prepare('SELECT COUNT(*) AS n FROM items').get().n === 0) {
  seed();
  console.log('Empty database found -> loaded sample data.');
}
ensureAdmin();

// Older databases (from before admission IDs) get an ID for each existing student.
const filled = backfillAdmissionIds();
if (filled) console.log(`Created admission IDs for ${filled} existing students (see Admins Block -> Admission IDs).`);

// Older databases: give every student a branch code + section so the Students pages can group them.
require('./services').fillStudentGroups();

// Make sure every catalog item points at its picture in Mini_Project/Dashboard/images/ (older databases may not).
require('./services').fixItemImages();

// Connect the college app database: its students and admission IDs are copied in (and re-checked regularly).
startAutoSync();

if (config.JWT_SECRET === 'dev-only-secret-change-me') {
  console.warn('WARNING: set JWT_SECRET in backend/.env before deploying.');
}

// On a public website the sample secrets must never be used: refuse to start instead of running unsafely.
if (process.env.NODE_ENV === 'production') {
  const problems = [];
  if (config.JWT_SECRET === 'dev-only-secret-change-me' || config.JWT_SECRET.length < 24) problems.push('JWT_SECRET (use a long random value)');
  if (config.ADMIN_PASSWORD === 'admin123' || config.ADMIN_PASSWORD.length < 8) problems.push('ADMIN_PASSWORD (at least 8 characters, not the sample one)');
  if (problems.length) {
    console.error('Refusing to start in production. Please set: ' + problems.join(' and '));
    process.exit(1);
  }
}

const app = express();

// The site runs behind the host's HTTPS proxy: trust it so each visitor has their own IP address
// (otherwise the "10 login attempts per minute" limit would be shared by everybody).
app.set('trust proxy', 1);

// Allow the frontend to call the API even if you open it with VS Code Live Server (port 5501).
app.use(cors({ origin: ['http://localhost:5501', 'http://127.0.0.1:5501', 'http://localhost:3000'] }));
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});

// Used by the host to check that the website is alive (and by uptime monitors).
app.get('/healthz', (req, res) => res.type('text').send('ok'));

// 1) API
app.use('/api', routes);
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));

// Bad requests (e.g. broken JSON) get a clean JSON error instead of an HTML page.
app.use((err, req, res, next) => {
  res.status(err.status || 400).json({ error: 'Invalid request' });
});

// 2) Frontend (your HTML/CSS/JS files) served from the same server
app.use(express.static(config.FRONTEND_DIR));
// Opening http://localhost:3000 shows index.html (the Student / Admin entry page).

app.listen(config.PORT, () => {
  console.log(`\nServer running ->  http://localhost:${config.PORT}`);
  console.log(`Admin login    ->  ${config.ADMIN_EMAIL}  (password from backend/.env)\n`);
});
