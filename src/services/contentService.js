'use strict';

/**
 * SEO content generation service.
 *
 * AI provider  : Google Gemini 1.5 Flash  (AI_PROVIDER=gemini, AI_API_KEY=...)
 * Image search : Serper.dev /images API   (SERPER_API_KEY=...)
 * WP publish   : WordPress REST API + JWT Authentication for WP-API plugin
 *
 * Falls back to mock data when keys are missing so local dev still works.
 */

const axios = require('axios');
const config = require('../config');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function siteBase(domain, ssl) {
  return (ssl ? 'https' : 'http') + '://' + domain;
}

/**
 * Call the Gemini 1.5 Flash generateContent endpoint and return the text.
 */
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
  var count = opts.count;
  var n = Math.max(1, Math.min(parseInt(count, 10) || 5, 100));

  if (config.ai.provider !== 'gemini' || !config.ai.apiKey) {
    return mockKeywords(topic, n);
  }

  try {
    var prompt =
      'Generate exactly ' + n + ' SEO keyword phrases for the topic: "' + topic + '".\n' +
      'Return ONLY a valid JSON array of strings, no explanation, no markdown. Example: ["kw1","kw2"]';

    var text = await callGemini(prompt);
    if (!text) return mockKeywords(topic, n);

    var match = text.match(/\[[\s\S]*\]/);
    if (match) {
      var parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, n);
    }
    return mockKeywords(topic, n);
  } catch (e) {
    return mockKeywords(topic, n);
  }
}

function mockKeywords(topic, n) {
  var seeds = ['best', 'how to', 'top', 'guide to', 'review of',
               'why', 'benefits of', 'tips for', 'introduction to', 'comparison of'];
  var out = [];
  for (var i = 0; i < n; i++) {
    out.push(seeds[i % seeds.length] + ' ' + topic);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2) Outline generation
// ---------------------------------------------------------------------------
async function generateOutline(opts) {
  var keyword     = opts.keyword;
  var numOutlines = opts.numOutlines || 9;
  var tone        = opts.tone || 'natural, humanize';

  if (config.ai.provider !== 'gemini' || !config.ai.apiKey) {
    return mockOutline(keyword, numOutlines);
  }

  try {
    var prompt =
      'Create a detailed SEO blog post outline for the keyword: "' + keyword + '".\n' +
      'Tone: ' + tone + '.\n' +
      'Include exactly ' + numOutlines + ' main sections (H2 headings).\n' +
      'Return ONLY a valid JSON object in this format (no markdown, no extra text):\n' +
      '{"keyword":"' + keyword + '","tone":"' + tone + '","sections":["H2: Section title 1","H2: Section title 2",...]}';

    var text = await callGemini(prompt);
    if (!text) return mockOutline(keyword, numOutlines);

    var match = text.match(/\{[\s\S]*\}/);
    if (match) {
      var parsed = JSON.parse(match[0]);
      if (parsed && Array.isArray(parsed.sections)) return parsed;
    }
    return mockOutline(keyword, numOutlines);
  } catch (e) {
    return mockOutline(keyword, numOutlines);
  }
}

function mockOutline(keyword, numOutlines) {
  var sections = [];
  for (var i = 1; i <= numOutlines; i++) {
    sections.push('H2: Section ' + i + ' about ' + keyword);
  }
  return { keyword: keyword, tone: 'natural, humanize', sections: sections };
}

// ---------------------------------------------------------------------------
// 3) Article generation
// ---------------------------------------------------------------------------
async function generateArticle(opts) {
  var keyword = opts.keyword;
  var outline = opts.outline;
  var tone    = opts.tone || 'natural, humanize';

  if (config.ai.provider !== 'gemini' || !config.ai.apiKey) {
    return mockArticle(keyword, outline);
  }

  try {
    var sectionsText = (outline.sections || [])
      .map(function(s, i) { return (i + 1) + '. ' + s; })
      .join('\n');

    var prompt =
      'Write a complete, high-quality SEO blog post for the keyword: "' + keyword + '".\n' +
      'Tone: ' + tone + '.\n' +
      'Use these sections as the structure:\n' + sectionsText + '\n\n' +
      'Requirements:\n' +
      '- Write in HTML (use <h1>, <h2>, <p>, <ul>, <li> tags)\n' +
      '- Each section should have 2-4 paragraphs of original content\n' +
      '- Include the keyword naturally throughout\n' +
      '- Return ONLY a JSON object: {"title":"Article title","content":"<html content>"}\n' +
      '- No markdown code blocks, no extra text outside the JSON';

    var text = await callGemini(prompt);
    if (!text) return mockArticle(keyword, outline);

    var match = text.match(/\{[\s\S]*\}/);
    if (match) {
      var parsed = JSON.parse(match[0]);
      if (parsed && parsed.title && parsed.content) return parsed;
    }
    return mockArticle(keyword, outline);
  } catch (e) {
    return mockArticle(keyword, outline);
  }
}

function mockArticle(keyword, outline) {
  var intro = '<h1>' + capitalize(keyword) + '</h1>\n<p>This article explores <strong>' + keyword + '</strong>.</p>\n';
  var body = (outline.sections || []).map(function(sec) {
    var heading = sec.replace(/^H2:\s*/, '');
    return '<h2>' + heading + '</h2>\n<p>Content for "' + heading + '".</p>\n';
  }).join('');
  return { title: capitalize(keyword), content: intro + body };
}

// ---------------------------------------------------------------------------
// 4) Image search via Serper.dev
// ---------------------------------------------------------------------------
async function fetchImages(opts) {
  var keyword = opts.keyword;
  var count   = opts.count || 3;
  var apiKey  = config.images.serperApiKey;

  if (!apiKey) {
    return mockImages(keyword, count);
  }

  try {
    var resp = await axios.post(
      'https://google.serper.dev/images',
      { q: keyword, num: count },
      {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    var images = (resp.data && resp.data.images) || [];
    return images.slice(0, count).map(function(img) {
      return {
        url:   img.imageUrl || img.link || '',
        title: img.title || keyword
      };
    });
  } catch (e) {
    return mockImages(keyword, count);
  }
}

function mockImages(keyword, count) {
  var out = [];
  for (var i = 0; i < count; i++) {
    out.push({
      url:   'https://picsum.photos/seed/' + encodeURIComponent(keyword) + '-' + i + '/1024/640',
      title: keyword
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5) WordPress REST API helpers (JWT Authentication for WP-API plugin)
// ---------------------------------------------------------------------------

/**
 * Obtain a JWT token from the WordPress site.
 * Requires "JWT Authentication for WP-API" plugin to be active on the site.
 * Returns the token string, or throws on failure.
 */
async function getWpToken(domain, ssl, username, password) {
  var base = siteBase(domain, ssl);
  var resp = await axios.post(
    base + '/wp-json/jwt-auth/v1/token',
    { username: username, password: password },
    { timeout: 20000 }
  );
  var token = resp.data && resp.data.token;
  if (!token) throw new Error('JWT token not returned by ' + domain);
  return token;
}

/**
 * List categories from the WordPress site.
 * Returns an array of { id, name, slug }.
 */
async function wpApiGetCategories(domain, ssl, token) {
  var base = siteBase(domain, ssl);
  var resp = await axios.get(base + '/wp-json/wp/v2/categories', {
    params: { per_page: 100, orderby: 'name', order: 'asc' },
    headers: { 'Authorization': 'Bearer ' + token },
    timeout: 20000
  });
  return (resp.data || []).map(function(c) {
    return { id: c.id, name: c.name, slug: c.slug };
  });
}

/**
 * Find a category by name (case-insensitive) or create it.
 * Returns the category ID, or null if name is falsy.
 */
async function wpApiGetOrCreateCategory(domain, ssl, token, name) {
  if (!name) return null;
  var base = siteBase(domain, ssl);

  // Search first
  var resp = await axios.get(base + '/wp-json/wp/v2/categories', {
    params: { search: name, per_page: 20 },
    headers: { 'Authorization': 'Bearer ' + token },
    timeout: 20000
  });
  var found = (resp.data || []).find(function(c) {
    return c.name.toLowerCase() === name.toLowerCase() ||
           c.slug === name.toLowerCase().replace(/\s+/g, '-');
  });
  if (found) return found.id;

  // Create if not found
  var createResp = await axios.post(
    base + '/wp-json/wp/v2/categories',
    { name: name },
    {
      headers: { 'Authorization': 'Bearer ' + token },
      timeout: 20000
    }
  );
  return createResp.data && createResp.data.id;
}

/**
 * Publish a post via WordPress REST API using a pre-obtained JWT token.
 * opts: { domain, ssl, token, title, content, status, category }
 * Returns the full WP post object (includes .link for the public URL).
 */
async function publishToWordPress(opts) {
  var domain   = opts.domain;
  var ssl      = opts.ssl;
  var token    = opts.token;
  var title    = opts.title;
  var content  = opts.content;
  var status   = opts.status || 'publish';
  var category = opts.category;

  var base    = siteBase(domain, ssl);
  var headers = { 'Authorization': 'Bearer ' + token };

  var payload = { title: title, content: content, status: status };

  if (category) {
    try {
      var catId = await wpApiGetOrCreateCategory(domain, ssl, token, category);
      if (catId) payload.categories = [catId];
    } catch (_) { /* category assignment is best-effort */ }
  }

  var resp = await axios.post(base + '/wp-json/wp/v2/posts', payload, {
    headers: headers,
    timeout: 90000
  });

  return resp.data; // .link = public permalink, .id = WP post ID
}

// ---------------------------------------------------------------------------
// 6) n8n bridge
// ---------------------------------------------------------------------------
async function dispatchToN8n(opts) {
  var payload = opts.payload;
  if (!config.n8n.webhookUrl) {
    return { skipped: true, reason: 'N8N_WEBHOOK_URL not set' };
  }
  var headers = {};
  if (config.n8n.webhookToken) headers['X-Webhook-Token'] = config.n8n.webhookToken;
  var resp = await axios.post(config.n8n.webhookUrl, payload, {
    headers: headers,
    timeout: 30000
  });
  return { ok: true, data: resp.data };
}

module.exports = {
  generateKeywords,
  generateOutline,
  generateArticle,
  fetchImages,
  getWpToken,
  wpApiGetCategories,
  wpApiGetOrCreateCategory,
  publishToWordPress,
  dispatchToN8n
};
