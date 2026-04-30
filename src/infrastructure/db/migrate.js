'use strict';

/**
 * Idempotent schema migration. Safe to run on every boot.
 *
 * Tables:
 *   users            — accounts (super_admin / admin), bcrypt password hash
 *   sites            — local cache of sites managed via EasyEngine
 *   content_jobs     — SEO content generation jobs (one per topic batch)
 *   content_keywords — per-keyword config + status inside a job
 *   logs             — application + command audit log surfaced in the UI
 */

const { getDb } = require('./connection');

function migrate() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL CHECK(role IN ('SUPER_ADMIN','ADMIN')),
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sites (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      domain      TEXT    NOT NULL UNIQUE,
      site_type   TEXT    NOT NULL DEFAULT 'wp',
      ssl         INTEGER NOT NULL DEFAULT 0,
      status      TEXT    NOT NULL DEFAULT 'unknown',
      title       TEXT,
      description TEXT,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_jobs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id     INTEGER REFERENCES sites(id) ON DELETE CASCADE,
      topic       TEXT    NOT NULL,
      num_keywords INTEGER NOT NULL DEFAULT 0,
      status      TEXT    NOT NULL DEFAULT 'PENDING',
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_keywords (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id        INTEGER NOT NULL REFERENCES content_jobs(id) ON DELETE CASCADE,
      keyword       TEXT    NOT NULL,
      tone          TEXT    NOT NULL DEFAULT 'natural, humanize',
      num_outlines  INTEGER NOT NULL DEFAULT 9,
      category      TEXT,
      publish_status TEXT   NOT NULL DEFAULT 'publish',
      title         TEXT,
      outline       TEXT,
      content       TEXT,
      images_json   TEXT,
      post_link     TEXT,
      status        TEXT    NOT NULL DEFAULT 'PENDING',
      error_message TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      level      TEXT    NOT NULL DEFAULT 'info',
      category   TEXT    NOT NULL DEFAULT 'app',
      message    TEXT    NOT NULL,
      meta_json  TEXT,
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_logs_created   ON logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_category  ON logs(category);
    CREATE INDEX IF NOT EXISTS idx_keywords_job   ON content_keywords(job_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_site      ON content_jobs(site_id);
  `);

  return db;
}

if (require.main === module) {
  migrate();
  // eslint-disable-next-line no-console
  console.log('Migration complete.');
}

module.exports = { migrate };
