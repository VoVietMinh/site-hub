import { query, queryOne, execute } from '../../infrastructure/db/connection';
import type { ContentJob, ContentKeyword } from '../../types';

export async function createJob(params: { site_id: number | null; topic: string; num_keywords: number; created_by: number | null }): Promise<ContentJob | null> {
  return queryOne<ContentJob>(
    "INSERT INTO content_jobs (site_id, topic, num_keywords, created_by, status) VALUES ($1,$2,$3,$4,'PENDING') RETURNING *",
    [params.site_id, params.topic, params.num_keywords, params.created_by]
  );
}

export async function findJob(id: number): Promise<ContentJob | null> {
  return queryOne<ContentJob>('SELECT * FROM content_jobs WHERE id = $1', [id]);
}

export async function listJobs(): Promise<ContentJob[]> {
  return query<ContentJob>(
    `SELECT j.*, s.domain FROM content_jobs j
       LEFT JOIN sites s ON s.id = j.site_id
       ORDER BY j.created_at DESC`
  );
}

export async function setJobStatus(id: number, status: string): Promise<ContentJob | null> {
  await execute('UPDATE content_jobs SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
  return findJob(id);
}

export async function addKeyword(params: {
  job_id: number; keyword: string; tone?: string;
  num_outlines?: number; category?: string | null; publish_status?: string;
}): Promise<ContentKeyword | null> {
  return queryOne<ContentKeyword>(
    'INSERT INTO content_keywords (job_id, keyword, tone, num_outlines, category, publish_status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [params.job_id, params.keyword, params.tone ?? 'natural, humanize', params.num_outlines ?? 9, params.category ?? null, params.publish_status ?? 'publish']
  );
}

export async function findKeyword(id: number): Promise<ContentKeyword | null> {
  return queryOne<ContentKeyword>('SELECT * FROM content_keywords WHERE id = $1', [id]);
}

export async function listKeywordsForJob(job_id: number): Promise<ContentKeyword[]> {
  return query<ContentKeyword>('SELECT * FROM content_keywords WHERE job_id = $1 ORDER BY id ASC', [job_id]);
}

export async function updateKeyword(id: number, fields: Partial<ContentKeyword>): Promise<ContentKeyword | null> {
  const allowed: (keyof ContentKeyword)[] = ['tone','num_outlines','category','publish_status','title','outline','content','images_json','post_link','status','error_message'];
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, k)) {
      sets.push(k + ' = $' + i);
      params.push(fields[k]);
      i++;
    }
  }
  if (!sets.length) return findKeyword(id);
  sets.push('updated_at = NOW()');
  params.push(id);
  await execute('UPDATE content_keywords SET ' + sets.join(', ') + ' WHERE id = $' + i, params);
  return findKeyword(id);
}
