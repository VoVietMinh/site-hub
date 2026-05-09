'use strict';

/**
 * Minimal SQLite-backed session store for express-session.
 *
 * Uses the better-sqlite3 connection that is already open — no extra
 * dependencies required.  Sessions are stored in a `sessions` table that
 * migrate.js creates on first boot.
 *
 * Features:
 *   • get / set / destroy / touch (full Store interface)
 *   • Automatic expiry cleanup every 15 minutes (timer is unref-ed so it
 *     never keeps the process alive by itself)
 *   • Thread-safe: better-sqlite3 is synchronous + single-connection
 */

const { Store } = require('express-session');
const { getDb }  = require('./connection');

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 min
const DEFAULT_TTL_MS      = 24 * 60 * 60 * 1000; // 1 day fallback

class SQLiteStore extends Store {
  constructor(options) {
    super(options);

    // Periodic expired-session cleanup
    const timer = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS);
    if (timer.unref) timer.unref(); // don't block process exit
  }

  // ── private ──────────────────────────────────────────────────────────────

  _db() { return getDb(); }

  _ttl(sess) {
    if (sess && sess.cookie && sess.cookie.maxAge) {
      return sess.cookie.maxAge * 1000;
    }
    return DEFAULT_TTL_MS;
  }

  _cleanup() {
    try {
      this._db()
        .prepare('DELETE FROM sessions WHERE expired_at <= ?')
        .run(Date.now());
    } catch (_) {
      // Non-fatal — cleanup failures are ignored
    }
  }

  // ── Store interface ───────────────────────────────────────────────────────

  /** Read a session by ID. */
  get(sid, cb) {
    try {
      const row = this._db()
        .prepare('SELECT sess FROM sessions WHERE sid = ? AND expired_at > ?')
        .get(sid, Date.now());

      if (!row) return cb(null, null);
      cb(null, JSON.parse(row.sess));
    } catch (err) {
      cb(err);
    }
  }

  /** Write (create or update) a session. */
  set(sid, sess, cb) {
    try {
      const expiredAt = Date.now() + this._ttl(sess);
      this._db()
        .prepare(
          `INSERT INTO sessions (sid, sess, expired_at)
           VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE
             SET sess       = excluded.sess,
                 expired_at = excluded.expired_at`
        )
        .run(sid, JSON.stringify(sess), expiredAt);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  /** Delete a session. */
  destroy(sid, cb) {
    try {
      this._db()
        .prepare('DELETE FROM sessions WHERE sid = ?')
        .run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  /** Refresh expiry without changing session data. */
  touch(sid, sess, cb) {
    try {
      const expiredAt = Date.now() + this._ttl(sess);
      this._db()
        .prepare('UPDATE sessions SET expired_at = ? WHERE sid = ?')
        .run(expiredAt, sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
}

module.exports = SQLiteStore;
