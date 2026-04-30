'use strict';

const { getDb } = require('../../infrastructure/db/connection');

function createJob({ site_id, topic, num_keywords, created_by }) {
  const info = getDb()
    .prepare(
      `INSERT INTO content_jobs (site_id, topic, num_keywords, created_by, status)
       VALUES (?, ?, ?, ?, 'PENDING')`
    )
    .run(site_id || null, topic, num_keywords, created_by || null);
  return findJob(info.lastInsertRowid);
}

function findJob(id) {
  return getDb().prepare('SELECT * FROM content_jobs WHERE id = ?').get(id);
}

function listJobs() {
  return getDb()
    .prepare(
      `SELECT j.*, s.domain
         FROM content_jobs j
         LEFT JOIN sites s ON s.id = j.site_id
         ORDER BY j.created_at DESC`
    )
    .all();
}

function setJobStatus(id, status) {
  getDb()
    .prepare("UPDATE content_jobs SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, id);
  return findJob(id);
}

function addKeyword({ job_id, keyword, tone, num_outlines, category, publish_status }) {
  const info = getDb()
    .prepare(
      `INSERT INTO content_keywords (job_id, keyword, tone, num_outlines, category, publish_status)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(job_id, keyword, tone || 'natural, humanize', num_outlines || 9, category || null, publish_status || 'publish');
  return findKeyword(info.lastInsertRowid);
}

function findKeyword(id) {
  return getDb().prepare('SELECT * FROM content_keywords WHERE id = ?').get(id);
}

function listKeywordsForJob(job_id) {
  return getDb()
    .prepare('SELECT * FROM content_keywords WHERE job_id = ? ORDER BY id ASC')
    .all(job_id);
}

function updateKeyword(id, fields) {
  const allowed = ['title', 'outline', 'content', 'images_json', 'post_link', 'status', 'error_message'];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, k)) {
      sets.push(`${k} = ?`);
      params.push(fields[k]);
    }
  }
  if (!sets.length) return findKeyword(id);
  sets.push("updated_at = datetime('now')");
  params.push(id);
  getDb()
    .prepare(`UPDATE content_keywords SET ${sets.join(', ')} WHERE id = ?`)
    .run(...params);
  return findKeyword(id);
}

module.exports = {
  createJob,
  findJob,
  listJobs,
  setJobStatus,
  addKeyword,
  findKeyword,
  listKeywordsForJob,
  updateKeyword
};
