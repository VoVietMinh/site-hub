'use strict';

/**
 * Single shared SQLite connection (better-sqlite3, synchronous, fast for
 * embedded admin panels). The DB file lives under ./data so it can be
 * volume-mounted from docker-compose.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../../config');

let db = null;

function getDb() {
  if (db) return db;

  const dir = path.dirname(config.db.path);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(config.db.path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, close };
