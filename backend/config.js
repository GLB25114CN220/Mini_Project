// config.js — all settings in one place.
const path = require('path');

// Load the values written in the .env file (Node 22 has this built in).
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* no .env file: use defaults */ }

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@glbajaj.ac.in',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
  DB_PATH: process.env.DB_PATH || path.join(__dirname, 'dress.db'),
  UPLOAD_DIR: path.join(__dirname, 'uploads'),
  // College app database that is mirrored into Students + Admission IDs (a .sqlite/.db file or a .csv file).
  COLLEGE_DB_PATH: path.resolve(__dirname, process.env.COLLEGE_DB_PATH || path.join('college', 'sample_college_students.sqlite')),
  COLLEGE_TABLE: process.env.COLLEGE_TABLE || 'students',
  // How often (minutes) the server checks the college database for new students. 0 = only at start-up / button.
  COLLEGE_SYNC_MINUTES: process.env.COLLEGE_SYNC_MINUTES === undefined ? 5 : Number(process.env.COLLEGE_SYNC_MINUTES),
  // The backend also serves your frontend, so everything runs from one address.
  FRONTEND_DIR: path.join(__dirname, '..', 'Mini_Project', 'Dashboard'),
};
