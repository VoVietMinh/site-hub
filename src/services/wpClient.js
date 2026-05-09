'use strict';

/**
 * WordPressClient — JWT-authenticated WP REST API client.
 *
 * Docker networking: all requests route to host.docker.internal (or WP_API_HOST)
 * with the real domain injected as the Host header, so EE's nginx-proxy routes
 * correctly. TLS cert errors are suppressed (cert is for the domain, not the
 * internal host). Dual-protocol retry handles wrong ssl settings transparently.
 *
 * JWT caching: token stored in sites.jwt_token / sites.jwt_expires_at.
 * expires_in from the token endpoint is an ABSOLUTE unix timestamp (not TTL).
 * Token refreshed 60s before expiry, and force-refreshed on first 401.
 */

const axios  = require('axios');
const https  = require('https');
const config = require('../config');
const { execute, queryOne } = require('../infrastructure/db/connection');

const _httpsAgent = new https.Agent({ rejectUnauthorized: false });

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// ---------------------------------------------------------------------------
class WordPressClient {
  constructor(site) {
    this._site     = site;                  // full row from sites table
    this._domain   = site.domain;
    this._ssl      = !!site.ssl;
    this._username = site.wp_user || '';
    // WP application passwords are displayed with spaces — strip them for auth
    this._password = (site.wp_pass || '').replace(/\s+/g, '');
  }

  // ── Internal networking ───────────────────────────────────────────────────

  _base(ssl) {
    const host = config.wpApiHost || 'host.docker.internal';
    return (ssl ? 'https' : 'http') + '://' + host;
  }

  _axiosCfg(ssl, extraHeaders) {
    const cfg = {
      headers: Object.assign({ Host: this._domain }, extraHeaders || {}),
      timeout:      30000,
      maxRedirects: 0
    };
    if (ssl) cfg.httpsAgent = _httpsAgent;
    return cfg;
  }

  // ── JWT token management ─────────────────────────────────────────────────

  async getToken() {
    // Cache hit — still valid for >60s
    if (this._site.jwt_token && this._site.jwt_expires_at) {
      const expiresMs = new Date(this._site.jwt_expires_at).getTime();
      if (Date.now() < expiresMs - 60000) {
        return this._site.jwt_token;
      }
    }
    return this._refreshToken();
  }

  async _refreshToken() {
    const body = { username: this._username, password: this._password };
    const endpoints = ['/wp-json/api/v1/token', '/wp-json/jwt-auth/v1/token'];
    const sslOrder  = [this._ssl, !this._ssl];

    let lastErr = null;
    for (const endpoint of endpoints) {
      for (const ssl of sslOrder) {
        try {
          const resp = await axios.post(
            this._base(ssl) + endpoint,
            body,
            this._axiosCfg(ssl, { 'Content-Type': 'application/json' })
          );
          const token = resp.data && (resp.data.jwt_token || resp.data.token);
          if (!token) throw new Error('No token field in response: ' + JSON.stringify(resp.data).slice(0, 200));

          // expires_in is an ABSOLUTE unix seconds timestamp, not a TTL
          const expiresAt = new Date(resp.data.expires_in * 1000);
          await this._saveToken(token, expiresAt);
          return token;
        } catch (err) {
          lastErr = err;
          const s = err.response && err.response.status;
          if ((s >= 300 && s < 400) || s === 403) continue;
          break;
        }
      }
    }
    const msg = lastErr && lastErr.message ? lastErr.message : 'unknown error';
    throw new Error('JWT auth failed for ' + this._domain + ': ' + msg);
  }

  async _saveToken(token, expiresAt) {
    this._site.jwt_token      = token;
    this._site.jwt_expires_at = expiresAt;
    await execute(
      'UPDATE sites SET jwt_token=$1, jwt_expires_at=$2, updated_at=NOW() WHERE id=$3',
      [token, expiresAt, this._site.id]
    );
  }

  // ── Authenticated request (auto-retry once on 401) ────────────────────────

  async _request(method, path, body, extraHeaders, _isRetry) {
    const token = await this.getToken();
    const authHdr = Object.assign(
      { Authorization: 'Bearer ' + token },
      extraHeaders || {}
    );

    const sslOrder = [this._ssl, !this._ssl];
    let lastErr = null;

    for (const ssl of sslOrder) {
      try {
        const cfg = this._axiosCfg(ssl, authHdr);
        let resp;
        if (method === 'GET') {
          resp = await axios.get(this._base(ssl) + path, cfg);
        } else if (method === 'POST') {
          resp = await axios.post(this._base(ssl) + path, body, cfg);
        } else {
          throw new Error('Unsupported method: ' + method);
        }
        return resp.data;
      } catch (err) {
        lastErr = err;
        const s = err.response && err.response.status;
        // 401 → force-refresh token, retry once
        if (s === 401 && !_isRetry) {
          this._site.jwt_token = null;
          this._site.jwt_expires_at = null;
          return this._request(method, path, body, extraHeaders, true);
        }
        // 403 / 3xx → try other protocol
        if ((s >= 300 && s < 400) || s === 403) continue;
        throw err;
      }
    }
    throw lastErr || new Error('WP request failed for ' + this._domain + ' ' + path);
  }

  // ── High-level WP REST helpers ────────────────────────────────────────────

  /**
   * Upload a media file. Returns { id, source_url }.
   */
  async uploadMedia(bytes, filename, contentType) {
    const token = await this.getToken();
    const authHdr = {
      Authorization:       'Bearer ' + token,
      'Content-Type':      contentType,
      'Content-Disposition': 'attachment; filename="' + encodeURIComponent(filename) + '"'
    };
    const sslOrder = [this._ssl, !this._ssl];
    let lastErr = null;

    for (const ssl of sslOrder) {
      try {
        const cfg = this._axiosCfg(ssl, authHdr);
        cfg.maxContentLength = 20 * 1024 * 1024;
        const resp = await axios.post(
          this._base(ssl) + '/wp-json/wp/v2/media',
          bytes,
          cfg
        );
        return { id: resp.data.id, source_url: resp.data.source_url };
      } catch (err) {
        lastErr = err;
        const s = err.response && err.response.status;
        if ((s >= 300 && s < 400) || s === 403) continue;
        break;
      }
    }
    throw lastErr || new Error('Media upload failed on ' + this._domain);
  }

  async listCategories() {
    const data = await this._request('GET', '/wp-json/wp/v2/categories?per_page=100&orderby=name&order=asc');
    return (data || []).map(function(c) { return { id: c.id, name: c.name, slug: c.slug }; });
  }

  async findTagByName(name) {
    const data = await this._request(
      'GET',
      '/wp-json/wp/v2/tags?search=' + encodeURIComponent(name) + '&per_page=20'
    );
    const found = (data || []).find(function(t) {
      return t.name.toLowerCase() === name.toLowerCase();
    });
    return found ? { id: found.id } : null;
  }

  async createTag(name) {
    const data = await this._request('POST', '/wp-json/wp/v2/tags',
      { name }, { 'Content-Type': 'application/json' });
    return { id: data.id };
  }

  async findOrCreateTag(name) {
    const existing = await this.findTagByName(name);
    if (existing) return existing.id;
    await sleep(config.articles.tagCreateDelayMs || 3000);
    const created = await this.createTag(name);
    return created.id;
  }

  async findOrCreateCategory(name) {
    if (!name) return null;
    const data = await this._request(
      'GET',
      '/wp-json/wp/v2/categories?search=' + encodeURIComponent(name) + '&per_page=20'
    );
    const found = (data || []).find(function(c) {
      return c.name.toLowerCase() === name.toLowerCase() ||
             c.slug === name.toLowerCase().replace(/\s+/g, '-');
    });
    if (found) return found.id;
    const created = await this._request('POST', '/wp-json/wp/v2/categories',
      { name }, { 'Content-Type': 'application/json' });
    return created.id;
  }

  async createPost(payload) {
    const data = await this._request('POST', '/wp-json/wp/v2/posts',
      payload, { 'Content-Type': 'application/json' });
    // Fix post link: replace internal host with real domain
    if (data && data.link) {
      data.link = data.link.replace(
        /^https?:\/\/[^/]+/,
        (this._ssl ? 'https' : 'http') + '://' + this._domain
      );
    }
    return data;
  }
}

module.exports = WordPressClient;
