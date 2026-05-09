'use strict';

const { query, queryOne, execute, pool } = require('../../infrastructure/db/connection');

// ── Articles ────────────────────────────────────────────────────────────────

async function createArticle(fields) {
  return queryOne(
    `INSERT INTO articles
       (site_id, user_id, keyword, outline_count, tone, status, publish_mode)
     VALUES ($1, $2, $3, $4, $5, 'PENDING', 'immediate')
     RETURNING *`,
    [fields.site_id, fields.user_id || null, fields.keyword,
     fields.outline_count || 9, fields.tone || 'natural, humanize']
  );
}

async function findArticle(id) {
  return queryOne('SELECT * FROM articles WHERE id = $1', [id]);
}

async function listArticlesForSite(siteId, opts) {
  opts = opts || {};
  const params = [siteId];
  let where = 'WHERE a.site_id = $1';
  if (opts.status) { where += ' AND a.status = $2'; params.push(opts.status); }
  const limit  = Math.min(parseInt(opts.limit, 10)  || 50, 200);
  const offset = Math.max(parseInt(opts.offset, 10) || 0,  0);
  params.push(limit);
  params.push(offset);
  return query(
    `SELECT a.*, s.domain AS site_domain
       FROM articles a
       JOIN sites s ON s.id = a.site_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
}

async function listAllArticles(opts) {
  opts = opts || {};
  const limit  = Math.min(parseInt(opts.limit, 10)  || 50, 200);
  const offset = Math.max(parseInt(opts.offset, 10) || 0,  0);
  const params = [limit, offset];
  const where = opts.status ? 'WHERE a.status = $3' : '';
  if (opts.status) params.push(opts.status);
  return query(
    `SELECT a.*, s.domain AS site_domain
       FROM articles a
       JOIN sites s ON s.id = a.site_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
    params
  );
}

/**
 * Atomic claim — returns true if the UPDATE changed a row (i.e. we own it now).
 */
async function claimArticleForBuild(id) {
  const result = await execute(
    "UPDATE articles SET status='BUILDING', updated_at=NOW() WHERE id=$1 AND status='PENDING'",
    [id]
  );
  return result.rowCount > 0;
}

async function updateArticle(id, fields) {
  const allowed = [
    'title','outline','content_html','meta_description','main_keyword',
    'tags','category_id','featured_media_id','wp_post_id','wp_post_link',
    'status','publish_mode','scheduled_at','error_message','retry_count',
    'outline_count','tone'
  ];
  const sets   = [];
  const params = [];
  let i = 1;
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, k)) {
      sets.push(k + ' = $' + i);
      // tags must be stored as JSON string in JSONB column
      params.push(k === 'tags' ? JSON.stringify(fields[k]) : fields[k]);
      i++;
    }
  }
  if (!sets.length) return findArticle(id);
  sets.push('updated_at = NOW()');
  params.push(id);
  await execute('UPDATE articles SET ' + sets.join(', ') + ' WHERE id = $' + i, params);
  return findArticle(id);
}

async function countArticlesForSite(siteId) {
  const row = await queryOne('SELECT COUNT(*) AS c FROM articles WHERE site_id = $1', [siteId]);
  return parseInt(row ? row.c : 0, 10);
}

// ── Article images ──────────────────────────────────────────────────────────

async function insertImage(fields) {
  return queryOne(
    `INSERT INTO article_images (article_id, position, source_url, wp_media_id, wp_media_url, is_featured)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [fields.article_id, fields.position || 0,
     fields.source_url || null, fields.wp_media_id || null,
     fields.wp_media_url || null, !!fields.is_featured]
  );
}

async function listImagesForArticle(articleId) {
  return query('SELECT * FROM article_images WHERE article_id = $1 ORDER BY position ASC', [articleId]);
}

async function clearImagesForArticle(articleId) {
  await execute('DELETE FROM article_images WHERE article_id = $1', [articleId]);
}

// ── Scheduler query ─────────────────────────────────────────────────────────

async function claimScheduledArticles(limit) {
  limit = limit || 10;
  // Claim QUEUED articles whose scheduled time has passed
  const rows = await query(
    `UPDATE articles SET status='PUBLISHING', updated_at=NOW()
      WHERE id IN (
        SELECT id FROM articles
         WHERE status='QUEUED' AND scheduled_at <= NOW()
         ORDER BY scheduled_at ASC
         LIMIT $1
      )
      RETURNING *`,
    [limit]
  );
  return rows;
}

module.exports = {
  createArticle, findArticle, listArticlesForSite, listAllArticles,
  claimArticleForBuild, updateArticle, countArticlesForSite,
  insertImage, listImagesForArticle, clearImagesForArticle,
  claimScheduledArticles
};
