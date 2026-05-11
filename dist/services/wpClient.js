"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordPressClient = void 0;
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const config_1 = __importDefault(require("../config"));
const connection_1 = require("../infrastructure/db/connection");
const _httpsAgent = new https_1.default.Agent({ rejectUnauthorized: false });
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
class WordPressClient {
    _site;
    _domain;
    _ssl;
    _username;
    _password;
    constructor(site) {
        this._site = site;
        this._domain = site.domain;
        this._ssl = !!site.ssl;
        this._username = site.wp_user ?? '';
        this._password = (site.wp_pass ?? '').replace(/\s+/g, '');
    }
    _base(ssl) {
        const host = config_1.default.wpApiHost || 'host.docker.internal';
        return (ssl ? 'https' : 'http') + '://' + host;
    }
    _axiosCfg(ssl, extraHeaders) {
        const cfg = {
            headers: Object.assign({ Host: this._domain }, extraHeaders ?? {}),
            timeout: 30000,
            maxRedirects: 0,
        };
        if (ssl)
            cfg['httpsAgent'] = _httpsAgent;
        return cfg;
    }
    async getToken() {
        if (this._site.jwt_token && this._site.jwt_expires_at) {
            const expiresMs = new Date(this._site.jwt_expires_at).getTime();
            if (Date.now() < expiresMs - 60000)
                return this._site.jwt_token;
        }
        return this._refreshToken();
    }
    async _refreshToken() {
        const body = { username: this._username, password: this._password };
        const endpoints = ['/wp-json/api/v1/token', '/wp-json/jwt-auth/v1/token'];
        const sslOrder = [this._ssl, !this._ssl];
        let lastErr = null;
        for (const endpoint of endpoints) {
            for (const ssl of sslOrder) {
                try {
                    const resp = await axios_1.default.post(this._base(ssl) + endpoint, body, this._axiosCfg(ssl, { 'Content-Type': 'application/json' }));
                    const token = resp.data?.jwt_token ?? resp.data?.token;
                    if (!token)
                        throw new Error('No token field in response: ' + JSON.stringify(resp.data).slice(0, 200));
                    const expiresAt = new Date(resp.data.expires_in * 1000);
                    await this._saveToken(token, expiresAt);
                    return token;
                }
                catch (err) {
                    lastErr = err;
                    const s = err.response?.status;
                    if ((s !== undefined && s >= 300 && s < 400) || s === 403)
                        continue;
                    break;
                }
            }
        }
        const msg = lastErr instanceof Error ? lastErr.message : 'unknown error';
        throw new Error('JWT auth failed for ' + this._domain + ': ' + msg);
    }
    async _saveToken(token, expiresAt) {
        this._site.jwt_token = token;
        this._site.jwt_expires_at = expiresAt.toISOString();
        await (0, connection_1.execute)('UPDATE sites SET jwt_token=$1, jwt_expires_at=$2, updated_at=NOW() WHERE id=$3', [token, expiresAt, this._site.id]);
    }
    async _request(method, path, body, extraHeaders, _isRetry = false) {
        const token = await this.getToken();
        const authHdr = Object.assign({ Authorization: 'Bearer ' + token }, extraHeaders ?? {});
        const sslOrder = [this._ssl, !this._ssl];
        let lastErr = null;
        for (const ssl of sslOrder) {
            try {
                const cfg = this._axiosCfg(ssl, authHdr);
                let resp;
                if (method === 'GET') {
                    resp = await axios_1.default.get(this._base(ssl) + path, cfg);
                }
                else {
                    resp = await axios_1.default.post(this._base(ssl) + path, body, cfg);
                }
                return resp.data;
            }
            catch (err) {
                lastErr = err;
                const s = err.response?.status;
                if (s === 401 && !_isRetry) {
                    this._site.jwt_token = undefined;
                    this._site.jwt_expires_at = undefined;
                    return this._request(method, path, body, extraHeaders, true);
                }
                if ((s !== undefined && s >= 300 && s < 400) || s === 403)
                    continue;
                throw err;
            }
        }
        throw lastErr ?? new Error('WP request failed for ' + this._domain + ' ' + path);
    }
    async uploadMedia(bytes, filename, contentType) {
        const token = await this.getToken();
        const authHdr = {
            Authorization: 'Bearer ' + token,
            'Content-Type': contentType,
            'Content-Disposition': 'attachment; filename="' + encodeURIComponent(filename) + '"',
        };
        const sslOrder = [this._ssl, !this._ssl];
        let lastErr = null;
        for (const ssl of sslOrder) {
            try {
                const cfg = this._axiosCfg(ssl, authHdr);
                cfg['maxContentLength'] = 20 * 1024 * 1024;
                const resp = await axios_1.default.post(this._base(ssl) + '/wp-json/wp/v2/media', bytes, cfg);
                return { id: resp.data.id, source_url: resp.data.source_url };
            }
            catch (err) {
                lastErr = err;
                const s = err.response?.status;
                if ((s !== undefined && s >= 300 && s < 400) || s === 403)
                    continue;
                break;
            }
        }
        throw lastErr ?? new Error('Media upload failed on ' + this._domain);
    }
    async listCategories() {
        const data = await this._request('GET', '/wp-json/wp/v2/categories?per_page=100&orderby=name&order=asc');
        return (data ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
    }
    async findTagByName(name) {
        const data = await this._request('GET', '/wp-json/wp/v2/tags?search=' + encodeURIComponent(name) + '&per_page=20');
        const found = (data ?? []).find((t) => t.name.toLowerCase() === name.toLowerCase());
        return found ? { id: found.id } : null;
    }
    async createTag(name) {
        const data = await this._request('POST', '/wp-json/wp/v2/tags', { name }, { 'Content-Type': 'application/json' });
        return { id: data.id };
    }
    async findOrCreateTag(name) {
        const existing = await this.findTagByName(name);
        if (existing)
            return existing.id;
        await sleep(config_1.default.articles.tagCreateDelayMs || 3000);
        const created = await this.createTag(name);
        return created.id;
    }
    async findOrCreateCategory(name) {
        if (!name)
            return null;
        const data = await this._request('GET', '/wp-json/wp/v2/categories?search=' + encodeURIComponent(name) + '&per_page=20');
        const found = (data ?? []).find((c) => c.name.toLowerCase() === name.toLowerCase() ||
            c.slug === name.toLowerCase().replace(/\s+/g, '-'));
        if (found)
            return found.id;
        const created = await this._request('POST', '/wp-json/wp/v2/categories', { name }, { 'Content-Type': 'application/json' });
        return created.id;
    }
    async createPost(payload) {
        const data = await this._request('POST', '/wp-json/wp/v2/posts', payload, { 'Content-Type': 'application/json' });
        if (data?.link) {
            data.link = data.link.replace(/^https?:\/\/[^/]+/, (this._ssl ? 'https' : 'http') + '://' + this._domain);
        }
        return data;
    }
}
exports.WordPressClient = WordPressClient;
exports.default = WordPressClient;
//# sourceMappingURL=wpClient.js.map