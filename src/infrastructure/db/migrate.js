'use strict';

/**
 * Idempotent schema migration for PostgreSQL. Safe to run on every boot.
 *
 * Tables:
 *   users            -- admin accounts, bcrypt password hash
 *   sites            -- WordPress sites managed via EasyEngine
 *   content_jobs     -- SEO content generation jobs
 *   content_keywords -- per-keyword config + pipeline status
 *   logs             -- application audit log
 *   sessions         -- persistent express-session store (connect-pg-simple)
 */

const { pool } = require('./connection');

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT    NOT NULL UNIQUE,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN')),
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sites (
      id          SERIAL PRIMARY KEY,
      domain      TEXT    NOT NULL UNIQUE,
      site_type   TEXT    NOT NULL DEFAULT 'wp',
      ssl         BOOLEAN NOT NULL DEFAULT FALSE,
      status      TEXT    NOT NULL DEFAULT 'unknown',
      title       TEXT,
      description TEXT,
      wp_user     TEXT,
      wp_pass     TEXT,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS content_jobs (
      id           SERIAL PRIMARY KEY,
      site_id      INTEGER REFERENCES sites(id) ON DELETE CASCADE,
      topic        TEXT    NOT NULL,
      num_keywords INTEGER NOT NULL DEFAULT 0,
      status       TEXT    NOT NULL DEFAULT 'PENDING',
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS content_keywords (
      id             SERIAL PRIMARY KEY,
      job_id         INTEGER NOT NULL REFERENCES content_jobs(id) ON DELETE CASCADE,
      keyword        TEXT    NOT NULL,
      tone           TEXT    NOT NULL DEFAULT 'natural, humanize',
      num_outlines   INTEGER NOT NULL DEFAULT 9,
      category       TEXT,
      publish_status TEXT    NOT NULL DEFAULT 'publish',
      title          TEXT,
      outline        TEXT,
      content        TEXT,
      images_json    TEXT,
      post_link      TEXT,
      status         TEXT    NOT NULL DEFAULT 'PENDING',
      error_message  TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS logs (
      id         SERIAL PRIMARY KEY,
      level      TEXT    NOT NULL DEFAULT 'info',
      category   TEXT    NOT NULL DEFAULT 'app',
      message    TEXT    NOT NULL,
      meta_json  TEXT,
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- connect-pg-simple session table
    CREATE TABLE IF NOT EXISTS sessions (
      sid    VARCHAR    NOT NULL COLLATE "default",
      sess   JSON       NOT NULL,
      expire TIMESTAMP(6) NOT NULL,
      CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_expire    ON sessions (expire);
    CREATE INDEX IF NOT EXISTS idx_logs_created       ON logs (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_category      ON logs (category);
    CREATE INDEX IF NOT EXISTS idx_keywords_job       ON content_keywords (job_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_site          ON content_jobs (site_id);
  `);

  // ── Article automation additions (idempotent) ────────────────────────────
  const siteAlters = [
    "ALTER TABLE sites ADD COLUMN IF NOT EXISTS jwt_token        TEXT",
    "ALTER TABLE sites ADD COLUMN IF NOT EXISTS jwt_expires_at   TIMESTAMPTZ",
    "ALTER TABLE sites ADD COLUMN IF NOT EXISTS default_status   TEXT NOT NULL DEFAULT 'draft'",
    "ALTER TABLE sites ADD COLUMN IF NOT EXISTS image_source     TEXT NOT NULL DEFAULT 'google'",
    "ALTER TABLE sites ADD COLUMN IF NOT EXISTS drive_folder_id  TEXT",
    "ALTER TABLE sites ADD COLUMN IF NOT EXISTS default_tone     TEXT NOT NULL DEFAULT 'natural, humanize'",
    "ALTER TABLE sites ADD COLUMN IF NOT EXISTS contact_info     TEXT"
  ];
  for (const sql of siteAlters) await pool.query(sql);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS articles (
      id                SERIAL PRIMARY KEY,
      site_id           INTEGER REFERENCES sites(id) ON DELETE CASCADE,
      user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
      keyword           TEXT    NOT NULL,
      title             TEXT,
      outline           TEXT,
      content_html      TEXT,
      meta_description  TEXT,
      main_keyword      TEXT,
      tags              JSONB,
      category_id       INTEGER,
      featured_media_id INTEGER,
      wp_post_id        INTEGER,
      wp_post_link      TEXT,
      outline_count     INTEGER NOT NULL DEFAULT 9,
      tone              TEXT    NOT NULL DEFAULT 'natural, humanize',
      status            TEXT    NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','QUEUED','BUILDING','READY','PUBLISHING','DONE','FAILED')),
      publish_mode      TEXT    NOT NULL DEFAULT 'immediate'
                          CHECK (publish_mode IN ('immediate','scheduled')),
      scheduled_at      TIMESTAMPTZ,
      error_message     TEXT,
      retry_count       INTEGER NOT NULL DEFAULT 0,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS article_images (
      id            SERIAL PRIMARY KEY,
      article_id    INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      position      INTEGER NOT NULL DEFAULT 0,
      source_url    TEXT,
      wp_media_id   INTEGER,
      wp_media_url  TEXT,
      is_featured   BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE INDEX IF NOT EXISTS idx_articles_site_status  ON articles (site_id, status);
    CREATE INDEX IF NOT EXISTS idx_articles_sched        ON articles (status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_article_imgs          ON article_images (article_id);
  `);
}

if (require.main === module) {
  migrate()
    .then(() => { console.log('Migration complete.'); process.exit(0); })
    .catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
}

module.exports = { migrate };
