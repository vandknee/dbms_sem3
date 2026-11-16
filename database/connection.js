const mysql = require('mysql2/promise');
const fs = require('node:fs');
if (fs.existsSync('.env')) process.loadEnvFile('.env');
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'rivertrace',
  user: process.env.DB_USER || 'rivertrace_app',
  password: process.env.DB_PASSWORD,
  dateStrings: true,
  connectionLimit: 8
});

const activity = [];
function logQuery(entry) {
  activity.unshift({
    id: Date.now() + Math.random(),
    at: new Date().toISOString(),
    ...entry
  });
  if (activity.length > 80) activity.pop();
}
function getActivity() { return activity.slice(); }

async function transaction(work) {
  const db = await pool.getConnection();
  try {
    await db.query('set transaction isolation level repeatable read');
    await db.beginTransaction();
    const result = await work(db);
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
module.exports = { pool, transaction, logQuery, getActivity };
