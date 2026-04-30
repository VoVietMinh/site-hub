'use strict';

/**
 * Logs repository — writes go through here so the rest of the app never
 * touches the DB directly.
 */

const { getDb } = require('../../infrastructure/db/connection');

const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

async function write({ level = 'info', category = 'app', message, meta, userId } = {}) {
  if (!message) return null;
  if (!VALID_LEVELS.has(level)) level = 'info';

  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO logs (level, category, message, meta_json, user_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(level, category, String(message), meta ? JSON.stringify(meta) : null, userId || null);
  return { id: info.lastInsertRowid };
}

function list({ limit = 200, offset = 0, category, level } = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (category) {
    where.push('category = ?');
    params.push(category);
  }
  if (level) {
    where.push('level = ?');
    params.push(level);
  }
  const sql =
    `SELECT l.*, u.username AS user_name
       FROM logs l
       LEFT JOIN users u ON u.id = l.user_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT ? OFFSET ?`;
  return db.prepare(sql).all(...params, limit, offset);
}

function count({ category, level } = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (category) {
    where.push('category = ?');
    params.push(category);
  }
  if (level) {
    where.push('level = ?');
    params.push(level);
  }
  const sql = `SELECT COUNT(*) AS c FROM logs ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  return db.prepare(sql).get(...params).c;
}

function distinctCategories() {
  return getDb()
    .prepare('SELECT DISTINCT category FROM logs ORDER BY category')
    .all()
    .map((r) => r.category);
}

module.exports = { write, list, count, distinctCategories };
