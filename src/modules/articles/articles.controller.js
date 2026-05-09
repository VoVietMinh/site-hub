'use strict';

const asyncHandler  = require('../../utils/asyncHandler');
const service       = require('./articles.service');
const repo          = require('./articles.repository');
const siteRepo      = require('../sites/site.repository');

// ── List articles ─────────────────────────────────────────────────────────────
exports.index = asyncHandler(async (req, res) => {
  const siteId = req.query.site_id ? parseInt(req.query.site_id, 10) : null;
  const status  = req.query.status  || null;
  const page    = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit   = 30;
  const offset  = (page - 1) * limit;

  let articles;
  if (siteId) {
    articles = await repo.listArticlesForSite(siteId, { status, limit, offset });
  } else {
    articles = await repo.listAllArticles({ status, limit, offset });
  }

  const sites = await siteRepo.listAll();
  res.render('articles/index', {
    title: 'Articles',
    articles,
    sites,
    filters: { site_id: siteId, status },
    page,
    limit
  });
});

// ── Article detail ────────────────────────────────────────────────────────────
exports.detail = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const article = await repo.findArticle(id);
  if (!article) return res.status(404).render('errors/404', { title: 'Not Found' });

  const artImages = await repo.listImagesForArticle(id);
  const site      = article.site_id ? await siteRepo.findById(article.site_id) : null;

  res.render('articles/detail', {
    title: article.title || article.keyword,
    article,
    artImages,
    site,
    filters: { site_id: req.query.site_id || null }
  });
});

// ── Status poll (JSON) ────────────────────────────────────────────────────────
exports.status = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const article = await repo.findArticle(id);
  if (!article) return res.status(404).json({ error: 'not found' });
  res.json({ article });
});

// ── Generate keywords → create PENDING articles ───────────────────────────────
exports.generateKeywords = asyncHandler(async (req, res) => {
  const { site_id, topic, count } = req.body || {};
  if (!site_id || !topic) {
    return res.status(400).json({ error: 'site_id and topic are required' });
  }
  try {
    const result = await service.generateKeywords(
      parseInt(site_id, 10),
      String(topic).trim(),
      parseInt(count, 10) || 5,
      req.session.user && req.session.user.id
    );
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Trigger build for a PENDING article ───────────────────────────────────────
exports.build = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { publish_mode, scheduled_at } = req.body || {};
  try {
    const result = await service.buildArticle(id, publish_mode || 'immediate', scheduled_at || null);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Retry a FAILED article ────────────────────────────────────────────────────
exports.retry = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const result = await service.retryArticle(id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Publish a READY article manually ─────────────────────────────────────────
exports.publish = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await service.publishArticle(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Update article fields (category, scheduled_at, etc.) ─────────────────────
exports.update = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const allowed = ['category_id', 'scheduled_at', 'publish_mode', 'tone', 'outline_count'];
  const fields  = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, k)) {
      fields[k] = req.body[k] || null;
    }
  }
  try {
    const updated = await repo.updateArticle(id, fields);
    res.json({ article: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Site categories (proxied from WP for dropdown) ────────────────────────────
exports.siteCategories = asyncHandler(async (req, res) => {
  const siteId = parseInt(req.params.siteId, 10);
  try {
    const site = await siteRepo.findById(siteId);
    if (!site) return res.status(404).json({ error: 'Site not found', categories: [] });
    const WordPressClient = require('../../services/wpClient');
    const wp = new WordPressClient(site);
    const categories = await wp.listCategories();
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message, categories: [] });
  }
});
