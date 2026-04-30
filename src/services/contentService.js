'use strict';

/**
 * SEO content generation service.
 *
 * The system is designed so the *real* generation happens either:
 *   • locally (mock provider) – good for dev / demo
 *   • via an n8n workflow      – the URL the user provides is POSTed with the
 *                                 keyword config; the workflow handles AI
 *                                 prompts, image fetching and WP publishing
 *                                 (mirrors the structure of the imported
 *                                 `auto_post_website.json`).
 *
 * The pieces are all stubbed/abstracted so swapping in real providers later
 * is mechanical.
 */

const axios = require('axios');
const config = require('../config');

// --------------------------------------------------------------------------
// 1) Keyword generation
// --------------------------------------------------------------------------
async function generateKeywords({ topic, count = 5 }) {
  const n = Math.max(1, Math.min(parseInt(count, 10) || 5, 100));

  if (config.ai.provider === 'mock' || !config.ai.apiKey) {
    return mockKeywords(topic, n);
  }

  // Real provider integration would go here. Kept as a clear extension point.
  // Example: OpenAI-compatible chat completion.
  try {
    const resp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You generate SEO keyword lists. Return ONLY a JSON array of strings.' },
          { role: 'user', content: `Generate ${n} SEO keywords for the topic: "${topic}". JSON array only.` }
        ],
        temperature: 0.7
      },
      {
        headers: { Authorization: `Bearer ${config.ai.apiKey}` },
        timeout: 30000
      }
    );
    const text = resp.data.choices[0].message.content.trim();
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : mockKeywords(topic, n);
  } catch (e) {
    return mockKeywords(topic, n);
  }
}

function mockKeywords(topic, n) {
  const seeds = [
    'best',
    'how to',
    'top',
    'guide to',
    'review of',
    'why',
    'benefits of',
    'tips for',
    'introduction to',
    'comparison of'
  ];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(`${seeds[i % seeds.length]} ${topic}`.toLowerCase());
  }
  return out;
}

// --------------------------------------------------------------------------
// 2) Outline + article generation (mock)
// --------------------------------------------------------------------------
async function generateOutline({ keyword, numOutlines = 9, tone = 'natural, humanize' }) {
  const sections = [];
  for (let i = 1; i <= numOutlines; i++) {
    sections.push(`H2: Section ${i} about ${keyword}`);
  }
  return { keyword, tone, sections };
}

async function generateArticle({ keyword, outline, tone = 'natural, humanize' }) {
  const intro = `# ${capitalize(keyword)}\n\nThis article explores **${keyword}** in a ${tone} voice.\n`;
  const body = outline.sections
    .map((sec, i) => {
      const heading = sec.replace(/^H2:\s*/, '');
      return `\n## ${heading}\n\nContent for "${heading}". This is placeholder copy that an AI provider would replace at runtime.\n`;
    })
    .join('\n');
  const conclusion = `\n## Conclusion\n\nFinal thoughts on ${keyword}.\n`;
  return {
    title: capitalize(keyword),
    content: intro + body + conclusion
  };
}

// --------------------------------------------------------------------------
// 3) Image fetching (placeholder)
// --------------------------------------------------------------------------
async function fetchImages({ keyword, count = 3 }) {
  // In production this hits SerpAPI / Google CSE. Mock returns placeholder
  // URLs so the rest of the pipeline still works end-to-end.
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      url: `https://picsum.photos/seed/${encodeURIComponent(keyword)}-${i}/1024/640`,
      alt: keyword
    });
  }
  return out;
}

// --------------------------------------------------------------------------
// 4) Publishing via WordPress REST API (json-api-auth plugin)
// --------------------------------------------------------------------------
async function publishToWordPress({
  domain,
  ssl = false,
  username,
  password,
  applicationPassword,
  title,
  content,
  status = 'publish',
  category
}) {
  const protocol = ssl ? 'https' : 'http';
  const base = `${protocol}://${domain}`;

  const auth = applicationPassword
    ? { username, password: applicationPassword }
    : { username, password };

  const payload = { title, content, status };

  if (category) {
    try {
      const cats = await axios.get(`${base}/wp-json/wp/v2/categories`, {
        params: { search: category },
        auth,
        timeout: 20000
      });
      const found = (cats.data || []).find((c) => c.name.toLowerCase() === String(category).toLowerCase());
      if (found) payload.categories = [found.id];
    } catch (_) { /* category lookup is best-effort */ }
  }

  const resp = await axios.post(`${base}/wp-json/wp/v2/posts`, payload, {
    auth,
    timeout: 60000
  });
  return resp.data; // includes link, id, status, etc.
}

// --------------------------------------------------------------------------
// 5) n8n bridge — POST keyword config to the workflow webhook
// --------------------------------------------------------------------------
async function dispatchToN8n({ payload }) {
  if (!config.n8n.webhookUrl) {
    return { skipped: true, reason: 'N8N_WEBHOOK_URL not set' };
  }
  const headers = {};
  if (config.n8n.webhookToken) headers['X-Webhook-Token'] = config.n8n.webhookToken;
  const resp = await axios.post(config.n8n.webhookUrl, payload, {
    headers,
    timeout: 30000
  });
  return { ok: true, data: resp.data };
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------
function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = {
  generateKeywords,
  generateOutline,
  generateArticle,
  fetchImages,
  publishToWordPress,
  dispatchToN8n
};
