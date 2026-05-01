'use strict';

const { getDb } = require('../../infrastructure/db/connection');

function findByDomain(domain) {
  return getDb().prepare('SELECT * FROM sites WHERE domain = ?').get(domain);
}

function listAll() {
  return getDb().prepare('SELECT * FROM sites ORDER BY created_at DESC').all();
}

function upsert({ domain, site_type = 'wp', ssl = 0, status = 'unknown',
                  title = null, description = null, created_by = null,
                  wp_user = null, wp_pass = null }) {
  const db = getDb();
  const existing = findByDomain(domain);
  if (existing) {
    db.prepare(
      `UPDATE sites
          SET site_type = ?, ssl = ?, status = ?,
              title = COALESCE(?, title),
              description = COALESCE(?, description),
              wp_user = COALESCE(?, wp_user),
              wp_pass = COALESCE(?, wp_pass),
              updated_at = datetime('now')
        WHERE domain = ?`
    ).run(site_type, ssl ? 1 : 0, status, title, description, wp_user, wp_pass, domain);
    return findByDomain(domain);
  }
  const info = db
    .prepare(
      `INSERT INTO sites (domain, site_type, ssl, status, title, description, created_by, wp_user, wp_pass)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(domain, site_type, ssl ? 1 : 0, status, title, description,
         created_by, wp_user || null, wp_pass || null);
  return getDb().prepare('SELECT * FROM sites WHERE id = ?').get(info.lastInsertRowid);
}

function updateCredentials(domain, wp_user, wp_pass) {
  getDb()
    .prepare("UPDATE sites SET wp_user = ?, wp_pass = ?, updated_at = datetime('now') WHERE domain = ?")
    .run(wp_user || null, wp_pass || null, domain);
  return findByDomain(domain);
}

function remove(domain) {
  return getDb().prepare('DELETE FROM sites WHERE domain = ?').run(domain);
}

module.exports = { findByDomain, listAll, upsert, updateCredentials, remove };
