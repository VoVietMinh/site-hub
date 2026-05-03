'use strict';

/**
 * SEO content generation + WordPress REST API service.
 *
 * AI provider  : Google Gemini 1.5 Flash  (AI_PROVIDER=gemini, AI_API_KEY=...)
 * Image search : Serper.dev /images       (SERPER_API_KEY=...)
 * WP publish   : WordPress REST API + JWT Authentication for WP-API plugin
 *
 * Docker networking note
 * ──────────────────────
 * When the panel runs inside Docker, `domain` resolves to 127.0.0.1 (the
 * container's own loopback), NOT to EE's nginx-proxy.  We therefore direct all
 * WP REST API calls to `host.docker.internal` (the Docker host gateway, where
 * EE's nginx-proxy actually listens) and pass the real domain as the HTTP
 * `Host` header so nginx-proxy routes to the correct site.
 *
 * Override with WP_API_HOST env var for non-Docker environments.
 */

const axios = require('axios');
const https = require('https');
const config = require('../config');

// ---------------------------------------------------------------------------
// WP API networking helpers
// ---------------------------------------------------------------------------

var _httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Returns the base URL for WP REST API calls.
 * Always goes to host.docker.internal (or WP_API_HOST) so Docker routing works.
 */
function wpBase(ssl) {
  var host = config.wpApiHost || 'host.docker.internal';
  return (ssl ? 'https' : 'http') + '://' + host;
}

/**
 * Builds the axios config for a WP REST API call.
 * Injects the domain as the Host header and disables TLS cert verification
 * (cert is issued for the domain, not for host.docker.internal).
 */
function wpCfg(domain, ssl, extra) {
  var cfg = {
    headers: Object.assign({ Host: domain }, extra || {}),
    timeout: 30000,
    maxRedirects: 0   // do not follow HTTP→HTTPS redirects to the real domain
  };
  if (ssl) cfg.httpsAgent = _httpsAgent;
  return cfg;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function callGemini(prompt) {
  var key = config.ai.apiKey;
  if (!key) return null;
  var url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' +
    key;
  var resp = await axios.post(
    url,
    { contents: [{ parts: [{ text: prompt }] }] },
    { timeout: 60000 }
  );
  var text =
    resp.data &&
    resp.data.candidates &&
    resp.data.candidates[0] &&
    resp.data.candidates[0].content &&
    resp.data.candidates[0].content.parts &&
    resp.data.candidates[0].content.parts[0] &&
    resp.data.candidates[0].content.parts[0].text;
  return text || null;
}

// ---------------------------------------------------------------------------
// 1) Keyword generation
// ---------------------------------------------------------------------------
async function generateKeywords(opts) {
  var topic = opts.topic;
  var n = Math.max(1, Math.min(parseInt(opts.count, 10) || 5, 100));

  if (config.ai.provider !== 'gemini' || !config.ai.apiKey) return mockKeywords(topic, n);

  try {
    var text = await callGemini(
      'Generate exactly ' + n + ' SEO keyword phrases for the topic: "' + topic + '".\n' +
      'Return ONLY a valid JSON array of strings, no explanation, no markdown. Example: ["kw1","kw2"]'
    );
    if (!text) return mockKeywords(topic, n);
    var m = text.match(/\[[\s\S]*\]/);
    if (m) {
      var p = JSON.parse(m[0]);
      if (Array.isArray(p) && p.length) return p.slice(0, n);
    }
  } catch (_) {}
  return mockKeywords(topic, n);
}

function mockKeywords(topic, n) {
  var seeds = ['best', 'how to', 'top', 'guide to', 'review of',
               'why', 'benefits of', 'tips for', 'introduction to', 'comparison of'];
  return Array.from({ length: n }, function(_, i) { return seeds[i % seeds.length] + ' ' + topic; });
}

// ---------------------------------------------------------------------------
// 2) Outline generation
// ---------------------------------------------------------------------------
async function generateOutline(opts) {
  var keyword = opts.keyword, n = opts.numOutlines || 9, tone = opts.tone || 'natural, humanize';
  if (config.ai.provider !== 'gemini' || !config.ai.apiKey) return mockOutline(keyword, n);
  try {
    var text = await callGemini(
      'Create a detailed SEO blog post outline for the keyword: "' + keyword + '".\n' +
      'Tone: ' + tone + '.\nInclude exactly ' + n + ' main sections (H2 headings).\n' +
      'Return ONLY a valid JSON object (no markdown, no extra text):\n' +
      '{"keyword":"' + keyword + '","tone":"' + tone + '","sections":["H2: Title 1","H2: Title 2",...]}'
    );
    if (!text) return mockOutline(keyword, n);
    var m = text.match(/\{[\s\S]*\}/);
    if (m) { var p = JSON.parse(m[0]); if (p && Array.isArray(p.sections)) return p; }
  } catch (_) {}
  return mockOutline(keyword, n);
}

function mockOutline(keyword, n) {
  return {
    keyword: keyword, tone: 'natural, humanize',
    sections: Array.from({ length: n }, function(_, i) { return 'H2: Section ' + (i + 1) + ' about ' + keyword; })
  };
}

// ---------------------------------------------------------------------------
// 3) Article generation
// ---------------------------------------------------------------------------
async function generateArticle(opts) {
  var keyword = opts.keyword, outline = opts.outline, tone = opts.tone || 'natural, humanize';
  if (config.ai.provider !== 'gemini' || !config.ai.apiKey) return mockArticle(keyword, outline);
  try {
    var sectionsText = (outline.sections || []).map(function(s, i) { return (i + 1) + '. ' + s; }).join('\n');
    var text = await callGemini(
      'Write a complete, high-quality SEO blog post for the keyword: "' + keyword + '".\n' +
      'Tone: ' + tone + '.\nUse these sections:\n' + sectionsText + '\n\n' +
      'Requirements:\n' +
      '- Write in HTML (use <h1>,<h2>,<p>,<ul>,<li> tags)\n' +
      '- Each section: 2-4 paragraphs of original content\n' +
      '- Include keyword naturally\n' +
      '- Return ONLY: {"title":"Article title","content":"<html content>"}\n' +
      '- No markdown code blocks, no extra text'
    );
    if (!text) return mockArticle(keyword, outline);
    var m = text.match(/\{[\s\S]*\}/);
    if (m) { var p = JSON.parse(m[0]); if (p && p.title && p.content) return p; }
  } catch (_) {}
  return mockArticle(keyword, outline);
}

function mockArticle(keyword, outline) {
  var intro = '<h1>' + capitalize(keyword) + '</h1>\n<p>This article explores <strong>' + keyword + '</strong>.</p>\n';
  var body = (outline.sections || []).map(function(sec) {
    var h = sec.replace(/^H2:\s*/, '');
    return '<h2>' + h + '</h2>\n<p>Content for "' + h + '".</p>\n';
  }).join('');
  return { title: capitalize(keyword), content: intro + body };
}

// ---------------------------------------------------------------------------
// 4) Image search via Serper.dev
// ---------------------------------------------------------------------------
async function fetchImages(opts) {
  var keyword = opts.keyword, count = opts.count || 3, apiKey = config.images.serperApiKey;
  if (!apiKey) return mockImages(keyword, count);
  try {
    var resp = await axios.post(
      'https://google.serper.dev/images',
      { q: keyword, num: count },
      { headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' }, timeout: 20000 }
    );
    var images = (resp.data && resp.data.images) || [];
    return images.slice(0, count).map(function(img) {
      return { url: img.imageUrl || img.link || '', title: img.title || keyword };
    });
  } catch (_) {}
  return mockImages(keyword, count);
}

function mockImages(keyword, count) {
  return Array.from({ length: count }, function(_, i) {
    return {
      url: 'https://picsum.photos/seed/' + encodeURIComponent(keyword) + '-' + i + '/1024/640',
      title: keyword
    };
  });
}

// ---------------------------------------------------------------------------
// 5) WordPress REST API — JWT Authentication for WP-API plugin
// ---------------------------------------------------------------------------

/**
 * Obtain a JWT token.
 * POST /wp-json/jwt-auth/v1/token
 */
async function getWpToken(domain, ssl, username, password) {
  var resp = await axios.post(
    wpBase(ssl) + '/wp-json/jwt-auth/v1/token',
    { username: username, password: password },
    wpCfg(domain, ssl, { 'Content-Type': 'application/json' })
  );
  var token = resp.data && resp.data.token;
  if (!token) throw new Error('JWT token not returned by ' + domain + '. Is the JWT Authentication for WP-API plugin active?');
  return token;
}

/**
 * List categories.
 * GET /wp-json/wp/v2/categories
 * Returns [{ id, name, slug }]
 */
async function wpApiGetCategories(domain, ssl, token) {
  // GET /wp-json/wp/v2/categories — https://developer.wordpress.org/rest-api/reference/categories/
  var resp = await axios.get(
    wpBase(ssl) + '/wp-json/wp/v2/categories?per_page=100&orderby=name&order=asc&hide_empty=false',
    wpCfg(domain, ssl, { Authorization: 'Bearer ' + token })
  );
  return (resp.data || []).map(function(c) {
    return { id: c.id, name: c.name, slug: c.slug, count: c.count || 0 };
  });
}

/**
 * Discover WordPress site info.
 * GET /wp-json/ (WP REST API root)
 * Returns { name, description, url } or throws.
 */
async function getWpSiteInfo(domain, ssl, token) {
  var resp = await axios.get(
    wpBase(ssl) + '/wp-json/',
    wpCfg(domain, ssl, { Authorization: 'Bearer ' + token })
  );
  var d = resp.data || {};
  return {
    name:        d.name        || domain,
    description: d.description || '',
    url:         d.url         || ((ssl ? 'https' : 'http') + '://' + domain),
    namespaces:  d.namespaces  || []
  };
}

/**
 * Find category by name (case-insensitive) or create it.
 * Returns the category ID, or null if name is falsy.
 */
async function wpApiGetOrCreateCategory(domain, ssl, token, name) {
  if (!name) return null;
  var base = wpBase(ssl);
  var searchResp = await axios.get(
    base + '/wp-json/wp/v2/categories?search=' + encodeURIComponent(name) + '&per_page=20',
    wpCfg(domain, ssl, { Authorization: 'Bearer ' + token })
  );
  var found = (searchResp.data || []).find(function(c) {
    return c.name.toLowerCase() === name.toLowerCase() ||
           c.slug === name.toLowerCase().replace(/\s+/g, '-');
  });
  if (found) return found.id;

  var createResp = await axios.post(
    base + '/wp-json/wp/v2/categories',
    { name: name },
    wpCfg(domain, ssl, {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    })
  );
  return createResp.data && createResp.data.id;
}

/**
 * Publish a post via WP REST API.
 * opts: { domain, ssl, token, title, content, status, category }
 * Returns the full WP post object (.link = public URL, .id = post ID).
 */
async function publishToWordPress(opts) {
  var domain = opts.domain, ssl = opts.ssl, token = opts.token;
  var payload = {
    title:   opts.title,
    content: opts.content,
    status:  opts.status || 'publish'
  };

  if (opts.category) {
    try {
      var catId = await wpApiGetOrCreateCategory(domain, ssl, token, opts.category);
      if (catId) payload.categories = [catId];
    } catch (_) {}
  }

  var resp = await axios.post(
    wpBase(ssl) + '/wp-json/wp/v2/posts',
    payload,
    wpCfg(domain, ssl, {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    })
  );

  // post_link may come back as the internal Docker URL — replace host with real domain
  var post = resp.data;
  if (post && post.link) {
    post.link = post.link.replace(/^https?:\/\/[^/]+/, (ssl ? 'https' : 'http') + '://' + domain);
  }
  return post;
}

// ---------------------------------------------------------------------------
// 6) n8n bridge
// ---------------------------------------------------------------------------
async function dispatchToN8n(opts) {
  if (!config.n8n.webhookUrl) return { skipped: true, reason: 'N8N_WEBHOOK_URL not set' };
  var headers = {};
  if (config.n8n.webhookToken) headers['X-Webhook-Token'] = config.n8n.webhookToken;
  var resp = await axios.post(config.n8n.webhookUrl, opts.payload, { headers, timeout: 30000 });
  return { ok: true, data: resp.data };
}

module.exports = {
  generateKeywords,
  generateOutline,
  generateArticle,
  fetchImages,
  getWpToken,
  getWpSiteInfo,
  wpApiGetCategories,
  wpApiGetOrCreateCategory,
  publishToWordPress,
  dispatchToN8n
};
