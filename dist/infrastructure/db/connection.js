"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
exports.queryOne = queryOne;
exports.execute = execute;
const pg_1 = require("pg");
const config_1 = __importDefault(require("../../config"));
exports.pool = new pg_1.Pool({ connectionString: config_1.default.database.url });
exports.pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
});
function dateToString(d) {
    return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}
function normaliseRow(row) {
    if (!row || typeof row !== 'object')
        return row;
    const out = {};
    for (const key of Object.keys(row)) {
        out[key] = row[key] instanceof Date ? dateToString(row[key]) : row[key];
    }
    return out;
}
async function query(sql, params) {
    const result = await exports.pool.query(sql, params);
    return result.rows.map(normaliseRow);
}
async function queryOne(sql, params) {
    const result = await exports.pool.query(sql, params);
    return normaliseRow(result.rows[0]) ?? null;
}
async function execute(sql, params) {
    return exports.pool.query(sql, params);
}
//# sourceMappingURL=connection.js.map