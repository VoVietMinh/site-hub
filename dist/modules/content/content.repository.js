"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJob = createJob;
exports.findJob = findJob;
exports.listJobs = listJobs;
exports.setJobStatus = setJobStatus;
exports.addKeyword = addKeyword;
exports.findKeyword = findKeyword;
exports.listKeywordsForJob = listKeywordsForJob;
exports.updateKeyword = updateKeyword;
const connection_1 = require("../../infrastructure/db/connection");
async function createJob(params) {
    return (0, connection_1.queryOne)("INSERT INTO content_jobs (site_id, topic, num_keywords, created_by, status) VALUES ($1,$2,$3,$4,'PENDING') RETURNING *", [params.site_id, params.topic, params.num_keywords, params.created_by]);
}
async function findJob(id) {
    return (0, connection_1.queryOne)('SELECT * FROM content_jobs WHERE id = $1', [id]);
}
async function listJobs() {
    return (0, connection_1.query)(`SELECT j.*, s.domain FROM content_jobs j
       LEFT JOIN sites s ON s.id = j.site_id
       ORDER BY j.created_at DESC`);
}
async function setJobStatus(id, status) {
    await (0, connection_1.execute)('UPDATE content_jobs SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
    return findJob(id);
}
async function addKeyword(params) {
    return (0, connection_1.queryOne)('INSERT INTO content_keywords (job_id, keyword, tone, num_outlines, category, publish_status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [params.job_id, params.keyword, params.tone ?? 'natural, humanize', params.num_outlines ?? 9, params.category ?? null, params.publish_status ?? 'publish']);
}
async function findKeyword(id) {
    return (0, connection_1.queryOne)('SELECT * FROM content_keywords WHERE id = $1', [id]);
}
async function listKeywordsForJob(job_id) {
    return (0, connection_1.query)('SELECT * FROM content_keywords WHERE job_id = $1 ORDER BY id ASC', [job_id]);
}
async function updateKeyword(id, fields) {
    const allowed = ['tone', 'num_outlines', 'category', 'publish_status', 'title', 'outline', 'content', 'images_json', 'post_link', 'status', 'error_message'];
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
        return findKeyword(id);
    sets.push('updated_at = NOW()');
    params.push(id);
    await (0, connection_1.execute)('UPDATE content_keywords SET ' + sets.join(', ') + ' WHERE id = $' + i, params);
    return findKeyword(id);
}
//# sourceMappingURL=content.repository.js.map