"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createArticle = createArticle;
exports.findArticle = findArticle;
exports.listArticlesForSite = listArticlesForSite;
exports.listAllArticles = listAllArticles;
exports.claimArticleForBuild = claimArticleForBuild;
exports.updateArticle = updateArticle;
exports.countArticlesForSite = countArticlesForSite;
exports.insertImage = insertImage;
exports.listImagesForArticle = listImagesForArticle;
exports.clearImagesForArticle = clearImagesForArticle;
exports.claimScheduledArticles = claimScheduledArticles;
const connection_1 = require("../../infrastructure/db/connection");
async function createArticle(fields) {
    return (0, connection_1.queryOne)(`INSERT INTO articles
       (site_id, user_id, keyword, outline_count, tone, status, publish_mode)
     VALUES ($1, $2, $3, $4, $5, 'PENDING', 'immediate')
     RETURNING *`, [fields.site_id, fields.user_id ?? null, fields.keyword,
        fields.outline_count ?? 9, fields.tone ?? 'natural, humanize']);
}
async function findArticle(id) {
    return (0, connection_1.queryOne)('SELECT * FROM articles WHERE id = $1', [id]);
}
async function listArticlesForSite(siteId, opts = {}) {
    const params = [siteId];
    let where = 'WHERE a.site_id = $1';
    if (opts.status) {
        where += ' AND a.status = $2';
        params.push(opts.status);
    }
    const limit = Math.min(parseInt(String(opts.limit ?? 50), 10) || 50, 200);
    const offset = Math.max(parseInt(String(opts.offset ?? 0), 10) || 0, 0);
    params.push(limit);
    params.push(offset);
    return (0, connection_1.query)(`SELECT a.*, s.domain AS site_domain
       FROM articles a
       JOIN sites s ON s.id = a.site_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
}
async function listAllArticles(opts = {}) {
    const limit = Math.min(parseInt(String(opts.limit ?? 50), 10) || 50, 200);
    const offset = Math.max(parseInt(String(opts.offset ?? 0), 10) || 0, 0);
    const params = [limit, offset];
    const where = opts.status ? 'WHERE a.status = $3' : '';
    if (opts.status)
        params.push(opts.status);
    return (0, connection_1.query)(`SELECT a.*, s.domain AS site_domain
       FROM articles a
       JOIN sites s ON s.id = a.site_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`, params);
}
async function claimArticleForBuild(id) {
    const result = await (0, connection_1.execute)("UPDATE articles SET status='BUILDING', updated_at=NOW() WHERE id=$1 AND status='PENDING'", [id]);
    return (result.rowCount ?? 0) > 0;
}
async function updateArticle(id, fields) {
    const allowed = [
        'title', 'outline', 'content_html', 'meta_description', 'main_keyword',
        'tags', 'category_id', 'featured_media_id', 'wp_post_id', 'wp_post_link',
        'status', 'publish_mode', 'scheduled_at', 'error_message', 'retry_count',
        'outline_count', 'tone',
    ];
    const sets = [];
    const params = [];
    let i = 1;
    for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(fields, k)) {
            sets.push(k + ' = $' + i);
            params.push(k === 'tags' ? JSON.stringify(fields[k]) : fields[k]);
            i++;
        }
    }
    if (!sets.length)
        return findArticle(id);
    sets.push('updated_at = NOW()');
    params.push(id);
    await (0, connection_1.execute)('UPDATE articles SET ' + sets.join(', ') + ' WHERE id = $' + i, params);
    return findArticle(id);
}
async function countArticlesForSite(siteId) {
    const row = await (0, connection_1.queryOne)('SELECT COUNT(*) AS c FROM articles WHERE site_id = $1', [siteId]);
    return parseInt(row?.c ?? '0', 10);
}
async function insertImage(fields) {
    return (0, connection_1.queryOne)(`INSERT INTO article_images (article_id, position, source_url, wp_media_id, wp_media_url, is_featured)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [fields.article_id, fields.position ?? 0,
        fields.source_url ?? null, fields.wp_media_id ?? null,
        fields.wp_media_url ?? null, !!fields.is_featured]);
}
async function listImagesForArticle(articleId) {
    return (0, connection_1.query)('SELECT * FROM article_images WHERE article_id = $1 ORDER BY position ASC', [articleId]);
}
async function clearImagesForArticle(articleId) {
    await (0, connection_1.execute)('DELETE FROM article_images WHERE article_id = $1', [articleId]);
}
async function claimScheduledArticles(limit = 10) {
    return (0, connection_1.query)(`UPDATE articles SET status='PUBLISHING', updated_at=NOW()
      WHERE id IN (
        SELECT id FROM articles
         WHERE status='QUEUED' AND scheduled_at <= NOW()
         ORDER BY scheduled_at ASC
         LIMIT $1
      )
      RETURNING *`, [limit]);
}
//# sourceMappingURL=articles.repository.js.map