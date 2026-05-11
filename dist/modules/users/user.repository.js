"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findByUsername = findByUsername;
exports.findByEmail = findByEmail;
exports.findById = findById;
exports.listAdmins = listAdmins;
exports.listAll = listAll;
exports.create = create;
exports.setActive = setActive;
const connection_1 = require("../../infrastructure/db/connection");
async function findByUsername(username) {
    return (0, connection_1.queryOne)('SELECT * FROM users WHERE username = $1', [username]);
}
async function findByEmail(email) {
    return (0, connection_1.queryOne)('SELECT * FROM users WHERE email = $1', [email]);
}
async function findById(id) {
    return (0, connection_1.queryOne)('SELECT * FROM users WHERE id = $1', [id]);
}
async function listAdmins() {
    return (0, connection_1.query)("SELECT id, username, email, role, is_active, created_at, updated_at FROM users WHERE role = 'ADMIN' ORDER BY created_at DESC");
}
async function listAll() {
    return (0, connection_1.query)("SELECT id, username, email, role, is_active, created_at, updated_at FROM users ORDER BY role DESC, created_at DESC");
}
async function create({ username, email, passwordHash, role = 'ADMIN', isActive = true }) {
    return (0, connection_1.queryOne)("INSERT INTO users (username, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *", [username, email, passwordHash, role, isActive]);
}
async function setActive(id, isActive) {
    await (0, connection_1.execute)("UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 AND role = 'ADMIN'", [isActive, id]);
    return findById(id);
}
//# sourceMappingURL=user.repository.js.map