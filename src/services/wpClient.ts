import axios from 'axios';
import https from 'https';
import { execute } from '../infrastructure/db/connection';
import type { Site } from '../types';

const _httpsAgent = new https.Agent({ rejectUnauthorized: false });

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class WordPressClient {
  private _site: Site;
  private _domain: string;
  private _ssl: boolean;
  private _username: string;
  private _password: string;

  constructor(site: Site) {
    this._site     = site;
    this._domain   = site.domain;
    this._ssl      = !!site.ssl;
    this._username = site.wp_user ?? '';
    this._password = (site.wp_pass ?? '').replace(/\s+/g, '');
  }

  /**
   * WordPress REST API calls always go directly to the domain over HTTPS.
   * The internal proxy (host.docker.internal) is only used for EasyEngine
   * site management — never for WP API operations.
   */
  private _base(ssl: boolean): string {
    return (ssl ? 'https' : 'http') + '://' + this._domain;
  }

  private _axiosCfg(ssl: boolean, extraHeaders?: Record<string, string>) {
    const cfg: Record<string, unknown> = {
      headers: extraHeaders ?? {},
      timeout: 30000,
      maxRedirects: 5,
    };
    if (ssl) cfg['httpsAgent'] = _httpsAgent;
    return cfg;
  }

  async getToken(): Promise<string> {
    if (this._site.jwt_token && this._site.jwt_expires_at) {
      const expiresMs = new Date(this._site.jwt_expires_at as string).getTime();
      if (Date.now() < expiresMs - 60000) return this._site.jwt_token as string;
    }
    return this._refreshToken();
  }

  private async _refreshToken(): Promise<string> {
    const body = { username: this._username, password: this._password };
    const endpoints = ['/wp-json/api/v1/token', '/wp-json/jwt-auth/v1/token'];
    const sslOrder  = [this._ssl, !this._ssl];
    let lastErr: unknown = null;

    for (const endpoint of endpoints) {
      for (const ssl of sslOrder) {
        try {
          const resp = await axios.post(
            this._base(ssl) + endpoint, body,
            this._axiosCfg(ssl, { 'Content-Type': 'application/json' })
          );
          const token: string | undefined = resp.data?.jwt_token ?? resp.data?.token;
          if (!token) throw new Error('No token field in response: ' + JSON.stringify(resp.data).slice(0, 200));
          const expiresAt = new Date((resp.data.expires_in as number) * 1000);
          await this._saveToken(token, expiresAt);
          return token;
        } catch (err) {
          lastErr = err;
          const s = (err as { response?: { status?: number } }).response?.status;
          if ((s !== undefined && s >= 300 && s < 400) || s === 403) continue;
          break;
        }
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : 'unknown error';
    throw new Error('JWT auth failed for ' + this._domain + ': ' + msg);
  }

  private async _saveToken(token: string, expiresAt: Date): Promise<void> {
    this._site.jwt_token      = token;
    this._site.jwt_expires_at = expiresAt.toISOString();
    await execute(
      'UPDATE sites SET jwt_token=$1, jwt_expires_at=$2, updated_at=NOW() WHERE id=$3',
      [token, expiresAt, this._site.id]
    );
  }

  private async _request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
    _isRetry = false
  ): Promise<unknown> {
    const token = await this.getToken();
    const authHdr = Object.assign({ Authorization: 'Bearer ' + token }, extraHeaders ?? {});
    const sslOrder = [this._ssl, !this._ssl];
    let lastErr: unknown = null;

    for (const ssl of sslOrder) {
      try {
        const cfg = this._axiosCfg(ssl, authHdr);
        let resp;
        if (method === 'GET') {
          resp = await axios.get(this._base(ssl) + path, cfg);
        } else {
          resp = await axios.post(this._base(ssl) + path, body, cfg);
        }
        return resp.data;
      } catch (err) {
        lastErr = err;
        const s = (err as { response?: { status?: number } }).response?.status;
        if (s === 401 && !_isRetry) {
          this._site.jwt_token      = undefined;
          this._site.jwt_expires_at = undefined;
          return this._request(method, path, body, extraHeaders, true);
        }
        if ((s !== undefined && s >= 300 && s < 400) || s === 403) continue;
        throw err;
      }
    }
    throw lastErr ?? new Error('WP request failed for ' + this._domain + ' ' + path);
  }

  async uploadMedia(bytes: Buffer, filename: string, contentType: string): Promise<{ id: number; source_url: string }> {
    const token = await this.getToken();
    const authHdr = {
      Authorization: 'Bearer ' + token,
      'Content-Type': contentType,
      'Content-Disposition': 'attachment; filename="' + encodeURIComponent(filename) + '"',
    };
    const sslOrder = [this._ssl, !this._ssl];
    let lastErr: unknown = null;

    for (const ssl of sslOrder) {
      try {
        const cfg = this._axiosCfg(ssl, authHdr) as Record<string, unknown>;
        cfg['maxContentLength'] = 20 * 1024 * 1024;
        const resp = await axios.post(this._base(ssl) + '/wp-json/wp/v2/media', bytes, cfg);
        return { id: resp.data.id as number, source_url: resp.data.source_url as string };
      } catch (err) {
        lastErr = err;
        const s = (err as { response?: { status?: number } }).response?.status;
        if ((s !== undefined && s >= 300 && s < 400) || s === 403) continue;
        break;
      }
    }
    throw lastErr ?? new Error('Media upload failed on ' + this._domain);
  }

  async listCategories(): Promise<Array<{ id: number; name: string; slug: string }>> {
    const data = await this._request('GET', '/wp-json/wp/v2/categories?per_page=100&orderby=name&order=asc') as Array<{ id: number; name: string; slug: string }>;
    return (data ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
  }

  async findTagByName(name: string): Promise<{ id: number } | null> {
    const data = await this._request('GET', '/wp-json/wp/v2/tags?search=' + encodeURIComponent(name) + '&per_page=20') as Array<{ id: number; name: string }>;
    const found = (data ?? []).find((t) => t.name.toLowerCase() === name.toLowerCase());
    return found ? { id: found.id } : null;
  }

  async createTag(name: string): Promise<{ id: number }> {
    const data = await this._request('POST', '/wp-json/wp/v2/tags', { name }, { 'Content-Type': 'application/json' }) as { id: number };
    return { id: data.id };
  }

  async findOrCreateTag(name: string): Promise<number> {
    const existing = await this.findTagByName(name);
    if (existing) return existing.id;
    await sleep(3000);
    const created = await this.createTag(name);
    return created.id;
  }

  async findOrCreateCategory(name: string | null): Promise<number | null> {
    if (!name) return null;
    const data = await this._request('GET', '/wp-json/wp/v2/categories?search=' + encodeURIComponent(name) + '&per_page=20') as Array<{ id: number; name: string; slug: string }>;
    const found = (data ?? []).find(
      (c) => c.name.toLowerCase() === name.toLowerCase() ||
             c.slug === name.toLowerCase().replace(/\s+/g, '-')
    );
    if (found) return found.id;
    const created = await this._request('POST', '/wp-json/wp/v2/categories', { name }, { 'Content-Type': 'application/json' }) as { id: number };
    return created.id;
  }

  async createPost(payload: Record<string, unknown>): Promise<{ id: number; link: string } & Record<string, unknown>> {
    const data = await this._request('POST', '/wp-json/wp/v2/posts', payload, { 'Content-Type': 'application/json' }) as { id: number; link?: string } & Record<string, unknown>;
    if (data?.link) {
      data.link = (data.link as string).replace(
        /^https?:\/\/[^/]+/,
        (this._ssl ? 'https' : 'http') + '://' + this._domain
      );
    }
    return data as { id: number; link: string } & Record<string, unknown>;
  }

  /** Quick connectivity check — tries JWT auth directly against the domain */
  async testConnection(): Promise<{ ok: boolean; token?: string; error?: string; via: string }> {
    const via = 'direct (' + this._domain + ')';
    try {
      this._site.jwt_token      = undefined;
      this._site.jwt_expires_at = undefined;
      const token = await this._refreshToken();
      return { ok: true, token: token.slice(0, 20) + '…', via };
    } catch (err) {
      return { ok: false, error: (err as Error).message, via };
    }
  }
}

export default WordPressClient;
