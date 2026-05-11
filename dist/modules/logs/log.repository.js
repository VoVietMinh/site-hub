"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.write = write;
exports.list = list;
exports.count = count;
exports.distinctCategories = distinctCategories;
exports.searchByMessage = searchByMessage;
const connection_1 = require("../../infrastructure/db/connection");
const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
async function write({ level = 'info', category = 'app', message, meta, userId, }) {
    if (!message)
        return null;
    if (!VALID_LEVELS.has(level))
        level = 'info';
    return (0, connection_1.queryOne)('INSERT INTO logs (level, category, message, meta_json, user_id) VALUES ($1,$2,$3,$4,$5) RETURNING id', [level, category, String(message), meta ? JSON.stringify(meta) : null, userId ?? null]);
}
async function list({ limit = 200, offset = 0, category, level } = {}) {
    const where = [];
    const params = [];
    let i = 1;
    if (category) {
        where.push('l.category = $' + i);
        params.push(category);
        i++;
    }
    if (level) {
        where.push('l.level = $' + i);
        params.push(level);
        i++;
    }
    params.push(limit);
    params.push(offset);
    return (0, connection_1.query)(`SELECT l.*, u.username AS user_name
       FROM logs l
       LEFT JOIN users u ON u.id = l.user_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT $${i} OFFSET $${i + 1}`, params);
}
async function count({ category, level } = {}) {
    const where = [];
    const params = [];
    let i = 1;
    if (category) {
        where.push('category = $' + i);
        params.push(category);
        i++;
    }
    if (level) {
        where.push('level = $' + i);
        params.push(level);
        i++;
    }
    const row = await (0, connection_1.queryOne)('SELECT COUNT(*) AS c FROM logs ' + (where.length ? 'WHERE ' + where.join(' AND ') : ''), params);
    return parseInt(row?.c ?? '0', 10);
}
async function distinctCategories() {
    const rows = await (0, connection_1.query)('SELECT DISTINCT category FROM logs ORDER BY category');
    return rows.map((r) => r.category);
}
async function searchByMessage(needle, limit = 30) {
    if (!needle || typeof needle !== 'string')
        return [];
    const like = '%' + needle + '%';
    return (0, connection_1.query)(`SELECT l.*, u.username AS user_name
       FROM logs l
       LEFT JOIN users u ON u.id = l.user_id
      WHERE l.message ILIKE $1 OR l.meta_json ILIKE $1
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT $2`, [like, limit]);
}
//# sourceMappingURL=log.repository.js.map