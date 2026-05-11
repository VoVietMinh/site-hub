"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findByDomain = findByDomain;
exports.findById = findById;
exports.listAll = listAll;
exports.upsert = upsert;
exports.updateCredentials = updateCredentials;
exports.remove = remove;
exports.updateSiteSettings = updateSiteSettings;
const connection_1 = require("../../infrastructure/db/connection");
async function findByDomain(domain) {
    return (0, connection_1.queryOne)('SELECT * FROM sites WHERE domain = $1', [domain]);
}
async function findById(id) {
    return (0, connection_1.queryOne)('SELECT * FROM sites WHERE id = $1', [id]);
}
async function listAll() {
    return (0, connection_1.query)('SELECT * FROM sites ORDER BY created_at DESC');
}
async function upsert(params) {
    const { domain, site_type = 'wp', ssl = false, status = 'unknown', title = null, description = null, created_by = null, wp_user = null, wp_pass = null } = params;
    return (0, connection_1.queryOne)(`INSERT INTO sites (domain, site_type, ssl, status, title, description, created_by, wp_user, wp_pass)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (domain) DO UPDATE SET
       site_type   = EXCLUDED.site_type,
       ssl         = EXCLUDED.ssl,
       status      = EXCLUDED.status,
       title       = COALESCE(EXCLUDED.title,       sites.title),
       description = COALESCE(EXCLUDED.description, sites.description),
       wp_user     = COALESCE(EXCLUDED.wp_user,     sites.wp_user),
       wp_pass     = COALESCE(EXCLUDED.wp_pass,     sites.wp_pass),
       updated_at  = NOW()
     RETURNING *`, [domain, site_type, !!ssl, status, title, description, created_by ?? null, wp_user ?? null, wp_pass ?? null]);
}
async function updateCredentials(domain, wp_user, wp_pass) {
    await (0, connection_1.execute)('UPDATE sites SET wp_user = $1, wp_pass = $2, updated_at = NOW() WHERE domain = $3', [wp_user ?? null, wp_pass ?? null, domain]);
    return findByDomain(domain);
}
async function remove(domain) {
    await (0, connection_1.execute)('DELETE FROM sites WHERE domain = $1', [domain]);
}
async function updateSiteSettings(id, fields) {
    const allowed = ['default_status', 'image_source', 'drive_folder_id', 'default_tone', 'contact_info'];
    const sets = [];
    const params = [];
    let i = 1;
    for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(fields, k)) {
            sets.push(k + ' = $' + i);
            params.push(fields[k]);
            i++;
        }
    }
    if (!sets.length)
        return findById(id);
    sets.push('updated_at = NOW()');
    params.push(id);
    await (0, connection_1.execute)('UPDATE sites SET ' + sets.join(', ') + ' WHERE id = $' + i, params);
    return findById(id);
}
//# sourceMappingURL=site.repository.js.map