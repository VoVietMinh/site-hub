'use strict';

const bcrypt = require('bcryptjs');
const repo = require('./user.repository');
const v = require('../../utils/validators');

async function authenticate({ username, password }) {
  if (!v.isValidUsername(username) || !v.isStrongPassword(password)) return null;
  const u = repo.findByUsername(username);
  if (!u || !u.is_active) return null;
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return null;
  return u;
}

async function createAdmin({ username, email, password }) {
  if (!v.isValidUsername(username)) {
    const e = new Error('invalid username'); e.status = 400; throw e;
  }
  if (!v.isValidEmail(email)) {
    const e = new Error('invalid email'); e.status = 400; throw e;
  }
  if (!v.isStrongPassword(password)) {
    const e = new Error('password must be 8-128 chars'); e.status = 400; throw e;
  }
  if (repo.findByUsername(username)) {
    const e = new Error('username already exists'); e.status = 409; throw e;
  }
  if (repo.findByEmail(email)) {
    const e = new Error('email already exists'); e.status = 409; throw e;
  }
  const hash = await bcrypt.hash(password, 10);
  return repo.create({ username, email, passwordHash: hash, role: 'ADMIN', isActive: 1 });
}

function listAdmins() {
  return repo.listAdmins();
}

function setActive(id, isActive) {
  return repo.setActive(id, isActive);
}

module.exports = { authenticate, createAdmin, listAdmins, setActive };
