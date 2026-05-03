'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const service = require('./content.service');
const repo = require('./content.repository');
const sitesRepo = require('../sites/site.repository');

exports.index = asyncHandler(async (req, res) => {
  const jobs = repo.listJobs();
  res.render('content/index', { title: res.__('content.title'), jobs });
});

exports.showNew = asyncHandler(async (req, res) => {
  const sites = sitesRepo.listAll();
  res.render('content/new', { title: res.__('content.newJob'), sites, values: {} });
});

exports.start = asyncHandler(async (req, res) => {
  const { topic, num_keywords, site_domain } = req.body || {};
  try {
    const job = await service.startJob({
      topic, numKeywords: parseInt(num_keywords, 10),
      siteDomain: site_domain || null, userId: req.session.user.id
    });
    req.flash('success', res.__('content.jobCreated'));
    res.redirect('/content/' + job.id);
  } catch (err) {
    req.flash('error', err.message);
    res.status(err.status || 500).render('content/new', {
      title: res.__('content.newJob'), sites: sitesRepo.listAll(), values: req.body
    });
  }
});

exports.detail = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = repo.findJob(id);
  if (!job) return res.status(404).render('errors/404', { title: 'Not Found' });
  const keywords = repo.listKeywordsForJob(id);
  res.render('content/detail', { title: 'Job #' + id, job, keywords });
});

exports.updateKeyword = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.kid, 10);
  await service.configureKeyword(id, {
    tone: req.body.tone, numOutlines: req.body.num_outlines,
    category: req.body.category, publishStatus: req.body.publish_status,
    title: req.body.title, content: req.body.content
  });
  req.flash('success', res.__('content.keywordUpdated'));
  if (req.body._return === 'keyword') {
    res.redirect('/content/' + req.params.id + '/keywords/' + req.params.kid);
  } else {
    res.redirect('/content/' + req.params.id);
  }
});

exports.runJob = asyncHandler(async (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  service.runJob(jobId, {}).catch(() => {});
  req.flash('info', res.__('content.jobStarted'));
  res.redirect('/content/' + jobId);
});

exports.runKeyword = asyncHandler(async (req, res) => {
  const kid = parseInt(req.params.kid, 10);
  service.runKeyword(kid, {}).catch(() => {});
  req.flash('info', res.__('content.keywordStarted'));
  res.redirect('/content/' + req.params.id);
});

exports.getCategories = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const categories = await service.getJobCategories(id);
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message, categories: [] });
  }
});

exports.jobStatus = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const data = service.getJobStatus(id);
  if (!data) return res.status(404).json({ error: 'not found' });
  res.json(data);
});

exports.checkConnection = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const result = await service.checkJobConnection(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

exports.keywordDetail = asyncHandler(async (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const kid   = parseInt(req.params.kid, 10);
  const job     = repo.findJob(jobId);
  const keyword = repo.findKeyword(kid);
  if (!job || !keyword) return res.status(404).render('errors/404', { title: 'Not Found' });

  // Resolve site — pass sanitised info (no password) to view
  let site = null;
  if (job.site_id) {
    try {
      const { getDb } = require('../../infrastructure/db/connection');
      const raw = getDb().prepare('SELECT * FROM sites WHERE id = ?').get(job.site_id);
      if (raw) {
        site = {
          domain:   raw.domain,
          ssl:      !!raw.ssl,
          wpUser:   raw.wp_user || null,
          hasCreds: !!(raw.wp_user && raw.wp_pass)
        };
      }
    } catch (_) {}
  }

  res.render('content/keyword', { title: keyword.keyword, job, keyword, site });
});

exports.publishKeyword = asyncHandler(async (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const kid   = parseInt(req.params.kid, 10);
  try {
    await service.publishKeyword(kid);
    req.flash('success', 'Published successfully');
  } catch (err) {
    req.flash('error', err.message);
  }
  res.redirect('/content/' + jobId);
});

exports.dispatchN8n = asyncHandler(async (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const result = await service.dispatchJobToN8n(jobId);
  if (result && result.skipped) {
    req.flash('error', res.__('content.n8nNotConfigured'));
  } else {
    req.flash('success', res.__('content.n8nDispatched'));
  }
  res.redirect('/content/' + jobId);
});
