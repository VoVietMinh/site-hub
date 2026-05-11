import { query, queryOne, execute } from '../../infrastructure/db/connection';
import type { Site } from '../../types';

export async function findByDomain(domain: string): Promise<Site | null> {
  return queryOne<Site>('SELECT * FROM sites WHERE domain = $1', [domain]);
}

export async function findById(id: number): Promise<Site | null> {
  return queryOne<Site>('SELECT * FROM sites WHERE id = $1', [id]);
}

export async function listAll(): Promise<Site[]> {
  return query<Site>('SELECT * FROM sites ORDER BY created_at DESC');
}

interface UpsertParams {
  domain: string;
  site_type?: string;
  ssl?: boolean;
  status?: string;
  title?: string | null;
  description?: string | null;
  created_by?: number | null;
  wp_user?: string | null;
  wp_pass?: string | null;
}

export async function upsert(params: UpsertParams): Promise<Site | null> {
  const { domain, site_type = 'wp', ssl = false, status = 'unknown',
          title = null, description = null, created_by = null,
          wp_user = null, wp_pass = null } = params;
  return queryOne<Site>(
    `INSERT INTO sites (domain, site_type, ssl, status, title, description, created_by, wp_user, wp_pass)
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
     RETURNING *`,
    [domain, site_type, !!ssl, status, title, description, created_by ?? null, wp_user ?? null, wp_pass ?? null]
  );
}

export async function updateCredentials(
  domain: string,
  wp_user: string | null,
  wp_pass: string | null,
  direct_connect?: boolean,
  ssl?: boolean
): Promise<Site | null> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];

  if (wp_user !== null) {
    params.push(wp_user);
    sets.push('wp_user = $' + params.length);
  }
  // Only overwrite password when a new one is provided (don't blank it on direct_connect toggle)
  if (wp_pass !== null && wp_pass !== '') {
    params.push(wp_pass);
    sets.push('wp_pass = $' + params.length);
  }
  if (direct_connect !== undefined) {
    params.push(direct_connect);
    sets.push('direct_connect = $' + params.length);
  }
  if (ssl !== undefined) {
    params.push(ssl);
    sets.push('ssl = $' + params.length);
  }
  params.push(domain);
  await execute(
    'UPDATE sites SET ' + sets.join(', ') + ' WHERE domain = $' + params.length,
    params
  );
  return findByDomain(domain);
}

export async function remove(domain: string): Promise<void> {
  await execute('DELETE FROM sites WHERE domain = $1', [domain]);
}

interface SiteSettingsFields {
  default_status?: string;
  image_source?: string;
  drive_folder_id?: string | null;
  default_tone?: string;
  contact_info?: string | null;
}

export async function updateSiteSettings(id: number, fields: SiteSettingsFields): Promise<Site | null> {
  const allowed: (keyof SiteSettingsFields)[] = ['default_status','image_source','drive_folder_id','default_tone','contact_info'];
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
  if (!sets.length) return findById(id);
  sets.push('updated_at = NOW()');
  params.push(id);
  await execute('UPDATE sites SET ' + sets.join(', ') + ' WHERE id = $' + i, params);
  return findById(id);
}
