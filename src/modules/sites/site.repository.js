'use strict';

const { getDb } = require('../../infrastructure/db/connection');

function findByDomain(domain) {
  return getDb().prepare('SELECT * FROM sites WHERE domain = ?').get(domain);
}

function listAll() {
  return getDb().prepare('SELECT * FROM sites ORDER BY created_at DESC').all();
}

function upsert({ domain, site_type = 'wp', ssl = 0, status = 'unknown', title = null, description = null, created_by = null }) {
  const db = getDb();
  const existing = findByDomain(domain);
  if (existing) {
    db.prepare(
      `UPDATE sites
          SET site_type = ?, ssl = ?, status = ?, title = COALESCE(?, title),
              description = COALESCE(?, description), updated_at = datetime('now')
        WHERE domain = ?`
    ).run(site_type, ssl ? 1 : 0, status, title, description, domain);
    return findByDomain(domain);
  }
  const info = db
    .prepare(
      `INSERT INTO sites (domain, site_type, ssl, status, title, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(domain, site_type, ssl ? 1 : 0, status, title, description, created_by);
  return getDb().prepare('SELECT * FROM sites WHERE id = ?').get(info.lastInsertRowid);
}

function remove(domain) {
  return getDb().prepare('DELETE FROM sites WHERE domain = ?').run(domain);
}

module.exports = { findByDomain, listAll, upsert, remove };
