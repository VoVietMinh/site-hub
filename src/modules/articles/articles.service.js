'use strict';

/**
 * Articles service — keyword generator, article builder pipeline, publisher.
 *
 * All heavy work runs in background (fire-and-forget). Controllers return
 * 202 immediately; UI polls GET /articles/:id for status.
 */

const fs   = require('fs');
const path = require('path');

const config         = require('../../config');
const llm            = require('../../services/llm');
const cse            = require('../../services/cse');
const WordPressClient= require('../../services/wpClient');
const images         = require('../../services/imagesPipeline');
const repo           = require('./articles.repository');
const siteRepo       = require('../sites/site.repository');
const logRepo        = require('../logs/log.repository');

// ---------------------------------------------------------------------------
// Load prompts at startup
// ---------------------------------------------------------------------------
const PROMPTS_DIR = path.join(__dirname, 'prompts');
function loadPrompt(name) {
  return fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8');
}

const PROMPT = {
  keywords:           loadPrompt('keyword_generation.txt'),
  title:              loadPrompt('title.txt'),
  research:           loadPrompt('research.txt'),
  outlineWithResearch:loadPrompt('outline_with_research.txt'),
  outlineNoResearch:  loadPrompt('outline_no_research.txt'),
  section:            loadPrompt('section.txt'),
  imageTranslate:     loadPrompt('image_translate.txt'),
  metadata:           loadPrompt('metadata.txt')
};

function render(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, function(_, key) {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : '{{' + key + '}}';
  });
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// ---------------------------------------------------------------------------
// Module 1 — Keyword Generator
// ---------------------------------------------------------------------------
async function generateKeywords(siteId, topic, count, userId) {
  count = Math.max(1, Math.min(50, parseInt(count, 10) || 5));
  const site = await siteRepo.findById(siteId);
  if (!site) throw Object.assign(new Error('Site not found'), { status: 404 });

  const prompt = render(PROMPT.keywords, { TOPIC: topic, COUNT: count });
  const text   = await llm.generate(prompt);

  const keywords = text.split('|').map(function(k) { return k.trim(); }).filter(Boolean);
  const created  = [];

  for (const keyword of keywords.slice(0, count)) {
    const art = await repo.createArticle({
      site_id:      siteId,
      user_id:      userId || null,
      keyword,
      outline_count: config.articles.defaultOutlineCount,
      tone:          site.default_tone || config.articles.defaultTone
    });
    created.push(art);
  }

  await logRepo.write({
    level: 'info', category: 'articles',
    message: 'Generated ' + created.length + ' keywords for topic "' + topic + '" on site ' + site.domain,
    userId
  });

  return { created: created.length, articles: created };
}

// ---------------------------------------------------------------------------
// Module 2 — Article Builder (orchestrator)
// ---------------------------------------------------------------------------
async function buildArticle(articleId, publishMode, scheduledAt) {
  const claimed = await repo.claimArticleForBuild(articleId);
  if (!claimed) {
    throw Object.assign(new Error('Article is not PENDING or already claimed'), { status: 409 });
  }
  await repo.updateArticle(articleId, { publish_mode: publishMode || 'immediate', scheduled_at: scheduledAt || null });

  // Run in background — do not await
  _buildPipeline(articleId).catch(function() {});
  return { ok: true, message: 'Build started' };
}

async function _buildPipeline(articleId) {
  let article = await repo.findArticle(articleId);
  const site  = await siteRepo.findById(article.site_id);
  const wp    = new WordPressClient(site);

  async function fail(msg) {
    await repo.updateArticle(articleId, {
      status: 'FAILED',
      error_message: String(msg).slice(0, 2000),
      retry_count: (article.retry_count || 0) + 1
    });
    await logRepo.write({ level: 'error', category: 'articles',
      message: 'Article #' + articleId + ' build failed: ' + msg });
  }

  async function save(fields) {
    article = await repo.updateArticle(articleId, fields);
  }

  try {
    // ── Step 1: Title ──────────────────────────────────────────────────────
    if (!article.title) {
      const raw = await llm.generate(render(PROMPT.title, { KEYWORD: article.keyword }));
      const title = String(raw).trim().slice(0, 60);
      await save({ title });
    }

    // ── Step 2: Outline ────────────────────────────────────────────────────
    if (!article.outline) {
      let outlineText;
      if (article.content_html) {
        // User pre-filled content_html → no-research path
        outlineText = await llm.generate(render(PROMPT.outlineNoResearch, {
          KEYWORD:       article.keyword,
          OUTLINE_COUNT: article.outline_count
        }));
      } else {
        // SERP research path
        const results = await cse.webSearch(article.keyword, 6);
        const links   = results.map(function(r) { return r.link; }).join('\n');
        const researchText = links
          ? await llm.generate(render(PROMPT.research, {
              KEYWORD:        article.keyword,
              COMBINED_LINKS: links
            }))
          : null;

        if (researchText) {
          outlineText = await llm.generate(render(PROMPT.outlineWithResearch, {
            KEYWORD:       article.keyword,
            OUTLINE_COUNT: article.outline_count,
            RESEARCH_TEXT: researchText
          }));
        } else {
          outlineText = await llm.generate(render(PROMPT.outlineNoResearch, {
            KEYWORD:       article.keyword,
            OUTLINE_COUNT: article.outline_count
          }));
        }
      }
      await save({ outline: outlineText.trim() });
    }

    const sections = article.outline
      .split('\n')
      .map(function(s) { return s.trim(); })
      .filter(Boolean);

    // ── Step 3: Write sections in parallel (chunks of 3) ─────────────────
    const existingHtml = article.content_html;
    // If content_html already has <h2> tags (prior partial run), skip regeneration
    const needSections = !existingHtml || !existingHtml.includes('<h2>');

    let paragraphs = [];
    if (needSections) {
      const fullOutline = sections.join('\n');
      const contactInfo = site.contact_info || '';

      // Process in chunks of 3 to avoid Gemini rate limits
      const CHUNK = 3;
      for (let i = 0; i < sections.length; i += CHUNK) {
        const chunk = sections.slice(i, i + CHUNK);
        const results = await Promise.all(chunk.map(function(outline) {
          return llm.generate(render(PROMPT.section, {
            OUTLINE:      outline,
            FULL_OUTLINE: fullOutline,
            KEYWORD:      article.keyword,
            TONE:         article.tone || config.articles.defaultTone,
            CONTACT_INFO: contactInfo
          }));
        }));
        paragraphs = paragraphs.concat(results);
      }
    } else {
      // Already have HTML — reconstruct paragraphs array from it for stitching
      paragraphs = [existingHtml];
    }

    // ── Steps 4+5: Images (acquire + upload to WP) ────────────────────────
    // Run in parallel with metadata (steps 4+5 and 6)
    const existingImages = await repo.listImagesForArticle(articleId);
    let imageUrls = existingImages.map(function(img) { return img.wp_media_url || null; });

    const imageSource = site.image_source || 'google';
    const imagesNeeded = needSections ? sections.length : 0;

    async function acquireAndUploadImages() {
      if (imageSource === 'none' || imagesNeeded === 0) return;
      if (existingImages.length >= imagesNeeded) return;

      // Translate keyword to English for better image results
      let englishKeyword = article.keyword;
      try {
        englishKeyword = await llm.generate(
          render(PROMPT.imageTranslate, { KEYWORD: article.keyword })
        );
        englishKeyword = String(englishKeyword).trim();
      } catch (_) {}

      let candidates = [];
      if (imageSource === 'google') {
        candidates = await cse.imageSearch(englishKeyword, imagesNeeded);
      }

      const downloaded = await images.validateAndDownload(candidates);
      if (!downloaded.length) return;

      await repo.clearImagesForArticle(articleId);
      imageUrls = [];

      for (let idx = 0; idx < downloaded.length && idx < imagesNeeded; idx++) {
        const img = downloaded[idx];
        try {
          const media = await wp.uploadMedia(img.bytes, img.filename, img.contentType);
          const isFeatured = idx === 0;
          await repo.insertImage({
            article_id: articleId,
            position:   idx,
            source_url: img.url,
            wp_media_id:  media.id,
            wp_media_url: media.source_url,
            is_featured:  isFeatured
          });
          imageUrls.push(media.source_url);
          if (isFeatured) {
            await save({ featured_media_id: media.id });
          }
        } catch (imgErr) {
          imageUrls.push(null);
          await logRepo.write({ level: 'warn', category: 'articles',
            message: 'Image upload failed for article #' + articleId + ': ' + imgErr.message });
        }
      }
    }

    // ── Step 6: Metadata ──────────────────────────────────────────────────
    async function generateMetadata() {
      if (article.meta_description && article.main_keyword && article.tags) return;
      const firstPara = paragraphs[0] || '';
      const metaSchema = {
        type: 'object',
        properties: {
          mainKeyword:     { type: 'string' },
          metaDescription: { type: 'string' },
          tags:            { type: 'array', items: { type: 'string' } }
        },
        required: ['mainKeyword', 'metaDescription', 'tags']
      };
      let meta = await llm.generate(render(PROMPT.metadata, {
        KEYWORD:         article.keyword,
        TITLE:           article.title || article.keyword,
        FIRST_PARAGRAPH: firstPara.slice(0, 500)
      }), { json: true, jsonSchema: metaSchema });

      // Ensure 3–5 tags
      if (!Array.isArray(meta.tags) || meta.tags.length < 3) {
        meta = await llm.generate(render(PROMPT.metadata, {
          KEYWORD:         article.keyword,
          TITLE:           article.title || article.keyword,
          FIRST_PARAGRAPH: firstPara.slice(0, 500)
        }), { json: true, jsonSchema: metaSchema });
      }

      // Sanity: truncate meta_description at word boundary ≤160 chars
      let desc = String(meta.metaDescription || '').trim();
      if (desc.length > 160) {
        desc = desc.slice(0, 160).replace(/\s\S+$/, '');
      }

      await save({
        main_keyword:    meta.mainKeyword || article.keyword,
        meta_description: desc,
        tags:            Array.isArray(meta.tags) ? meta.tags.slice(0, 5) : []
      });
    }

    // Run images + metadata concurrently
    await Promise.all([acquireAndUploadImages(), generateMetadata()]);

    // Reload after concurrent updates
    article = await repo.findArticle(articleId);

    // ── Step 7: Stitch final HTML ─────────────────────────────────────────
    if (needSections) {
      const finalImageUrls = (await repo.listImagesForArticle(articleId))
        .sort(function(a, b) { return a.position - b.position; })
        .map(function(img) { return img.wp_media_url || null; });

      const html = stitchHtml(paragraphs, finalImageUrls);

      // Sanity checks
      if (!html.includes('<h2>') || html.length < 1000) {
        return fail('Content too short or missing <h2> sections (length: ' + html.length + ')');
      }

      await save({ content_html: html });
    }

    // ── Set READY ─────────────────────────────────────────────────────────
    await save({ status: 'READY', error_message: null });

    // ── Trigger publish or queue ──────────────────────────────────────────
    article = await repo.findArticle(articleId);
    if (article.publish_mode === 'immediate') {
      await publishArticle(articleId);
    } else {
      await repo.updateArticle(articleId, { status: 'QUEUED' });
    }

  } catch (err) {
    await fail(err.message || String(err));
  }
}

// ---------------------------------------------------------------------------
// HTML stitcher
// ---------------------------------------------------------------------------
function stitchHtml(paragraphs, imageUrls) {
  let html = '';
  for (let i = 0; i < paragraphs.length; i++) {
    const cleaned = llm.stripFences(paragraphs[i] || '');
    html += '<div class="content-section">';
    const blocks = cleaned.split(/\n\n+/).map(function(b) { return '<p>' + b + '</p>'; }).join('');
    html += blocks;
    html += '</div>';
    const url = imageUrls && imageUrls[i];
    if (url) {
      html += '<div class="image-section"><img src="' + url + '" alt="" title=""></div>';
    }
  }
  return html;
}

// ---------------------------------------------------------------------------
// Module 3 — WordPress Publisher
// ---------------------------------------------------------------------------
async function publishArticle(articleId) {
  const article = await repo.findArticle(articleId);
  if (!article) throw new Error('Article not found: ' + articleId);
  if (article.wp_post_id) {
    // Already published — idempotent
    await repo.updateArticle(articleId, { status: 'DONE' });
    return;
  }

  const site = await siteRepo.findById(article.site_id);
  const wp   = new WordPressClient(site);

  await repo.updateArticle(articleId, { status: 'PUBLISHING', error_message: null });

  try {
    // Resolve tag IDs
    const tagNames = Array.isArray(article.tags)
      ? article.tags
      : (article.tags ? JSON.parse(article.tags) : []);

    const tagIds = [];
    for (const name of tagNames) {
      try {
        const id = await wp.findOrCreateTag(name);
        tagIds.push(id);
      } catch (_) {}
    }

    // Build post payload
    const isScheduled = article.publish_mode === 'scheduled' &&
                        article.scheduled_at &&
                        new Date(article.scheduled_at) > new Date();

    const payload = {
      title:   article.title || article.keyword,
      content: article.content_html || '',
      status:  isScheduled ? 'future' : (site.default_status || 'publish')
    };

    if (isScheduled) {
      payload.date_gmt = new Date(article.scheduled_at).toISOString().replace(/\.\d{3}Z$/, '');
    }
    if (tagIds.length)            payload.tags       = tagIds;
    if (article.category_id)      payload.categories = [article.category_id];
    if (article.featured_media_id) payload.featured_media = article.featured_media_id;

    // Add Yoast meta if main_keyword or meta_description set
    if (article.main_keyword || article.meta_description) {
      payload.meta = {};
      if (article.main_keyword)     payload.meta._yoast_wpseo_focuskw   = article.main_keyword;
      if (article.meta_description) payload.meta._yoast_wpseo_metadesc  = article.meta_description;
    }

    const post = await wp.createPost(payload);

    if (!post || !post.id) throw new Error('WP returned no post id');

    await repo.updateArticle(articleId, {
      status:       'DONE',
      wp_post_id:   post.id,
      wp_post_link: post.link || null,
      error_message: null
    });
    await logRepo.write({ level: 'info', category: 'articles',
      message: 'Article #' + articleId + ' "' + (article.title || article.keyword) +
               '" published: ' + (post.link || post.id) });

  } catch (err) {
    // Yoast meta silently dropped — retry without meta block if that was the error
    const errMsg = String(err.message || err);
    if (errMsg.includes('meta') && payload && payload.meta) {
      delete payload.meta;
      try {
        const post = await wp.createPost(payload);
        await repo.updateArticle(articleId, {
          status: 'DONE', wp_post_id: post.id, wp_post_link: post.link || null
        });
        await logRepo.write({ level: 'warn', category: 'articles',
          message: 'Article #' + articleId + ' published without Yoast meta (Yoast not installed)' });
        return;
      } catch (_) {}
    }
    await repo.updateArticle(articleId, {
      status: 'FAILED',
      error_message: errMsg.slice(0, 2000),
      retry_count: (article.retry_count || 0) + 1
    });
    await logRepo.write({ level: 'error', category: 'articles',
      message: 'Article #' + articleId + ' publish failed: ' + errMsg });
  }
}

// ---------------------------------------------------------------------------
// Retry a FAILED article (idempotent — resumes from last known good state)
// ---------------------------------------------------------------------------
async function retryArticle(articleId) {
  const article = await repo.findArticle(articleId);
  if (!article) throw Object.assign(new Error('Article not found'), { status: 404 });
  if (article.status !== 'FAILED') {
    throw Object.assign(new Error('Only FAILED articles can be retried'), { status: 409 });
  }
  // Reset to PENDING so claimArticleForBuild can claim it
  await repo.updateArticle(articleId, { status: 'PENDING', error_message: null });
  const claimed = await repo.claimArticleForBuild(articleId);
  if (!claimed) throw new Error('Failed to claim article for retry');
  _buildPipeline(articleId).catch(function() {});
  return { ok: true };
}

module.exports = {
  generateKeywords,
  buildArticle,
  publishArticle,
  retryArticle,
  stitchHtml
};
