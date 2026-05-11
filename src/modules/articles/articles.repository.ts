import { query, queryOne, execute } from '../../infrastructure/db/connection';
import type { Article, ArticleImage, ArticlePublish } from '../../types';

interface CreateArticleParams {
  site_id?: number | null;
  user_id?: number | null;
  keyword: string;
  outline_count?: number;
  tone?: string;
  language?: string;
}

export async function createArticle(fields: CreateArticleParams): Promise<Article | null> {
  return queryOne<Article>(
    `INSERT INTO articles
       (site_id, user_id, keyword, outline_count, tone, language, status, publish_mode)
     VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'immediate')
     RETURNING *`,
    [fields.site_id ?? null, fields.user_id ?? null, fields.keyword,
     fields.outline_count ?? 9, fields.tone ?? 'natural, humanize',
     fields.language ?? 'English']
  );
}

export async function findArticle(id: number): Promise<Article | null> {
  return queryOne<Article>('SELECT * FROM articles WHERE id = $1', [id]);
}

interface ListOpts {
  status?: string | null;
  limit?: number;
  offset?: number;
}

export async function listArticlesForSite(siteId: number, opts: ListOpts = {}): Promise<Article[]> {
  const params: unknown[] = [siteId];
  let where = 'WHERE a.site_id = $1';
  if (opts.status) { where += ' AND a.status = $2'; params.push(opts.status); }
  const limit  = Math.min(parseInt(String(opts.limit ?? 50), 10) || 50, 200);
  const offset = Math.max(parseInt(String(opts.offset ?? 0), 10) || 0, 0);
  params.push(limit);
  params.push(offset);
  return query<Article>(
    `SELECT a.*, s.domain AS site_domain
       FROM articles a
       LEFT JOIN sites s ON s.id = a.site_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
}

export async function listAllArticles(opts: ListOpts = {}): Promise<Article[]> {
  const limit  = Math.min(parseInt(String(opts.limit ?? 50), 10) || 50, 200);
  const offset = Math.max(parseInt(String(opts.offset ?? 0), 10) || 0, 0);
  const params: unknown[] = [limit, offset];
  const where = opts.status ? 'WHERE a.status = $3' : '';
  if (opts.status) params.push(opts.status);
  return query<Article>(
    `SELECT a.*, s.domain AS site_domain
       FROM articles a
       LEFT JOIN sites s ON s.id = a.site_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
    params
  );
}

export async function claimArticleForBuild(id: number): Promise<boolean> {
  const result = await execute(
    "UPDATE articles SET status='BUILDING', updated_at=NOW() WHERE id=$1 AND status='PENDING'",
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

type ArticleUpdateFields = Partial<Pick<Article,
  'title'|'outline'|'content_html'|'meta_description'|'main_keyword'|
  'tags'|'category_id'|'featured_media_id'|'wp_post_id'|'wp_post_link'|
  'status'|'publish_mode'|'scheduled_at'|'error_message'|'retry_count'|
  'outline_count'|'tone'|'language'|'build_step'|'site_id'
>>;

export async function updateBuildStep(id: number, step: string | null): Promise<void> {
  await execute('UPDATE articles SET build_step=$1, updated_at=NOW() WHERE id=$2', [step, id]);
}

export async function updateArticle(id: number, fields: ArticleUpdateFields): Promise<Article | null> {
  const allowed: (keyof ArticleUpdateFields)[] = [
    'title','outline','content_html','meta_description','main_keyword',
    'tags','category_id','featured_media_id','wp_post_id','wp_post_link',
    'status','publish_mode','scheduled_at','error_message','retry_count',
    'outline_count','tone','language','build_step','site_id',
  ];
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, k)) {
      sets.push(k + ' = $' + i);
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

export async function countArticlesForSite(siteId: number): Promise<number> {
  const row = await queryOne<{ c: string }>('SELECT COUNT(*) AS c FROM articles WHERE site_id = $1', [siteId]);
  return parseInt(row?.c ?? '0', 10);
}

interface InsertImageParams {
  article_id: number;
  position?: number;
  source_url?: string | null;
  wp_media_id?: number | null;
  wp_media_url?: string | null;
  is_featured?: boolean;
}

export async function insertImage(fields: InsertImageParams): Promise<ArticleImage | null> {
  return queryOne<ArticleImage>(
    `INSERT INTO article_images (article_id, position, source_url, wp_media_id, wp_media_url, is_featured)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [fields.article_id, fields.position ?? 0,
     fields.source_url ?? null, fields.wp_media_id ?? null,
     fields.wp_media_url ?? null, !!fields.is_featured]
  );
}

export async function listImagesForArticle(articleId: number): Promise<ArticleImage[]> {
  return query<ArticleImage>('SELECT * FROM article_images WHERE article_id = $1 ORDER BY position ASC', [articleId]);
}

export async function clearImagesForArticle(articleId: number): Promise<void> {
  await execute('DELETE FROM article_images WHERE article_id = $1', [articleId]);
}

export async function claimScheduledArticles(limit = 10): Promise<Article[]> {
  return query<Article>(
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
}

// ── Publish history ───────────────────────────────────────────────────────────

interface InsertPublishParams {
  article_id: number;
  site_id: number | null;
  site_domain: string;
  category_id?: number | null;
}

export async function insertPublish(fields: InsertPublishParams): Promise<ArticlePublish | null> {
  return queryOne<ArticlePublish>(
    `INSERT INTO article_publishes (article_id, site_id, site_domain, category_id, status)
     VALUES ($1, $2, $3, $4, 'PUBLISHING') RETURNING *`,
    [fields.article_id, fields.site_id ?? null, fields.site_domain, fields.category_id ?? null]
  );
}

interface UpdatePublishParams {
  status: 'DONE' | 'FAILED';
  wp_post_id?: number | null;
  wp_post_link?: string | null;
  error_message?: string | null;
}

export async function updatePublish(id: number, fields: UpdatePublishParams): Promise<void> {
  await execute(
    `UPDATE article_publishes
        SET status=$1, wp_post_id=$2, wp_post_link=$3, error_message=$4, updated_at=NOW()
      WHERE id=$5`,
    [fields.status, fields.wp_post_id ?? null, fields.wp_post_link ?? null, fields.error_message ?? null, id]
  );
}

export async function listPublishesForArticle(articleId: number): Promise<ArticlePublish[]> {
  return query<ArticlePublish>(
    'SELECT * FROM article_publishes WHERE article_id = $1 ORDER BY created_at DESC',
    [articleId]
  );
}
