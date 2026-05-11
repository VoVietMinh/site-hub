import { Pool, QueryResult } from 'pg';
import config from '../../config';

export const pool = new Pool({ connectionString: config.database.url });

pool.on('error', (err: Error) => {
  console.error('PostgreSQL pool error:', err.message);
});

function dateToString(d: Date): string {
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

function normaliseRow<T extends Record<string, unknown>>(row: T): T {
  if (!row || typeof row !== 'object') return row;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    out[key] = row[key] instanceof Date ? dateToString(row[key] as Date) : row[key];
  }
  return out as T;
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result: QueryResult<T> = await pool.query(sql, params);
  return result.rows.map(normaliseRow);
}

export async function queryOne<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const result: QueryResult<T> = await pool.query(sql, params);
  return normaliseRow(result.rows[0]) ?? null;
}

export async function execute(sql: string, params?: unknown[]): Promise<QueryResult> {
  return pool.query(sql, params);
}
