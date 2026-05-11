import { query, queryOne } from '../../infrastructure/db/connection';

const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

interface WriteParams {
  level?: string;
  category?: string;
  message: string;
  meta?: Record<string, unknown>;
  userId?: number | null;
}

export async function write({
  level = 'info', category = 'app', message, meta, userId,
}: WriteParams): Promise<{ id: number } | null> {
  if (!message) return null;
  if (!VALID_LEVELS.has(level)) level = 'info';
  return queryOne<{ id: number }>(
    'INSERT INTO logs (level, category, message, meta_json, user_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [level, category, String(message), meta ? JSON.stringify(meta) : null, userId ?? null]
  );
}

interface ListParams {
  limit?: number;
  offset?: number;
  category?: string | null;
  level?: string | null;
}

export async function list({ limit = 200, offset = 0, category, level }: ListParams = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (category) { where.push('l.category = $' + i); params.push(category); i++; }
  if (level)    { where.push('l.level = $'    + i); params.push(level);    i++; }
  params.push(limit);
  params.push(offset);
  return query(
    `SELECT l.*, u.username AS user_name
       FROM logs l
       LEFT JOIN users u ON u.id = l.user_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
}

export async function count({ category, level }: { category?: string | null; level?: string | null } = {}): Promise<number> {
  const where: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (category) { where.push('category = $' + i); params.push(category); i++; }
  if (level)    { where.push('level = $'    + i); params.push(level);    i++; }
  const row = await queryOne<{ c: string }>(
    'SELECT COUNT(*) AS c FROM logs ' + (where.length ? 'WHERE ' + where.join(' AND ') : ''),
    params
  );
  return parseInt(row?.c ?? '0', 10);
}

export async function distinctCategories(): Promise<string[]> {
  const rows = await query<{ category: string }>('SELECT DISTINCT category FROM logs ORDER BY category');
  return rows.map((r) => r.category);
}

export async function searchByMessage(needle: string, limit = 30) {
  if (!needle || typeof needle !== 'string') return [];
  const like = '%' + needle + '%';
  return query(
    `SELECT l.*, u.username AS user_name
       FROM logs l
       LEFT JOIN users u ON u.id = l.user_id
      WHERE l.message ILIKE $1 OR l.meta_json ILIKE $1
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT $2`,
    [like, limit]
  );
}
