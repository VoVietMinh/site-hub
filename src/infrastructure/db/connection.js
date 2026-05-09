'use strict';

/**
 * PostgreSQL connection pool (node-postgres).
 * All queries go through the helpers below so repos never touch pool.query
 * directly and error context stays consistent.
 */

const { Pool } = require('pg');
const config   = require('../../config');

const pool = new Pool({ connectionString: config.database.url });

pool.on('error', function (err) {
  console.error('PostgreSQL pool error:', err.message);
});

/**
 * Convert a JavaScript Date to "YYYY-MM-DD HH:MM:SS" string (UTC).
 * PostgreSQL returns TIMESTAMPTZ columns as Date objects; our views
 * expect the SQLite-style string format so .split(' ')[0] etc. work.
 */
function dateToString(d) {
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

function normaliseRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const key of Object.keys(row)) {
    out[key] = row[key] instanceof Date ? dateToString(row[key]) : row[key];
  }
  return out;
}

/** Run a query; return all rows as an array. */
async function query(sql, params) {
  const result = await pool.query(sql, params);
  return result.rows.map(normaliseRow);
}

/** Run a query; return the first row or null. */
async function queryOne(sql, params) {
  const result = await pool.query(sql, params);
  return normaliseRow(result.rows[0] || null);
}

/** Run an INSERT / UPDATE / DELETE; return the pg result object. */
async function execute(sql, params) {
  return pool.query(sql, params);
}

module.exports = { pool, query, queryOne, execute };
