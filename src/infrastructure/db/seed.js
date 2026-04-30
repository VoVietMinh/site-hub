'use strict';

/**
 * First-run seed: ensures a SUPER_ADMIN account exists. Credentials come from
 * env (SUPER_ADMIN_USERNAME / SUPER_ADMIN_PASSWORD / SUPER_ADMIN_EMAIL).
 */

const bcrypt = require('bcryptjs');
const { getDb } = require('./connection');
const config = require('../../config');

function seed() {
  const db = getDb();

  const existing = db
    .prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1")
    .get();

  if (existing) return existing;

  const hash = bcrypt.hashSync(config.superAdmin.password, 10);
  const info = db
    .prepare(
      `INSERT INTO users (username, email, password_hash, role, is_active)
       VALUES (?, ?, ?, 'SUPER_ADMIN', 1)`
    )
    .run(config.superAdmin.username, config.superAdmin.email, hash);

  // eslint-disable-next-line no-console
  console.log(
    `Seeded SUPER_ADMIN: ${config.superAdmin.username} (id=${info.lastInsertRowid})`
  );
  return { id: info.lastInsertRowid };
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
