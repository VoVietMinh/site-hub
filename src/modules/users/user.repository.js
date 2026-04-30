'use strict';

const { getDb } = require('../../infrastructure/db/connection');

function findByUsername(username) {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function findByEmail(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function findById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function listAdmins() {
  return getDb()
    .prepare(
      `SELECT id, username, email, role, is_active, created_at, updated_at
         FROM users
        WHERE role = 'ADMIN'
        ORDER BY created_at DESC`
    )
    .all();
}

function listAll() {
  return getDb()
    .prepare(
      `SELECT id, username, email, role, is_active, created_at, updated_at
         FROM users
        ORDER BY role DESC, created_at DESC`
    )
    .all();
}

function create({ username, email, passwordHash, role = 'ADMIN', isActive = 1 }) {
  const info = getDb()
    .prepare(
      `INSERT INTO users (username, email, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(username, email, passwordHash, role, isActive ? 1 : 0);
  return findById(info.lastInsertRowid);
}

function setActive(id, isActive) {
  getDb()
    .prepare(
      "UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ? AND role = 'ADMIN'"
    )
    .run(isActive ? 1 : 0, id);
  return findById(id);
}

module.exports = {
  findByUsername,
  findByEmail,
  findById,
  listAdmins,
  listAll,
  create,
  setActive
};
