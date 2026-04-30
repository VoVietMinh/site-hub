'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const service = require('./content.service');
const repo = require('./content.repository');
const sitesRepo = require('../sites/site.repository');

exports.index = asyncHandler(async (req, res) => {
  const jobs = repo.listJobs();
  res.render('content/index', {
    title: res.__('content.title'),
    jobs
  });
});

exports.showNew = asyncHandler(async (req, res) => {
  const sites = sitesRepo.listAll();
  res.render('content/new', {
    title: res.__('content.newJob'),
    sites,
    values: {}
  });
});

exports.start = asyncHandler(async (req, res) => {
  const { topic, num_keywords, site_domain } = req.body || {};
  try {
    const job = await service.startJob({
      topic,
      numKeywords: parseInt(num_keywords, 10),
      siteDomain: site_domain || null,
      userId: req.session.user.id
    });
    req.flash('success', res.__('content.jobCreated'));
    res.redirect('/content/' + job.id);
  } catch (err) {
    req.flash('error', err.message);
    res.status(err.status || 500).render('content/new', {
      title: res.__('content.newJob'),
      sites: sitesRepo.listAll(),
      values: req.body
    });
  }
});

exports.detail = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const job = repo.findJob(id);
  if (!job) return res.status(404).render('errors/404', { title: 'Not Found' });
  const keywords = repo.listKeywordsForJob(id);
  res.render('content/detail', {
    title: `Job #${id}`,
    job,
    keywords
  });
});

exports.updateKeyword = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.kid, 10);
  await service.configureKeyword(id, {
    tone: req.body.tone,
    numOutlines: req.body.num_outlines,
    category: req.body.category,
    publishStatus: req.body.publish_status,
    title: req.body.title
  });
  req.flash('success', res.__('content.keywordUpdated'));
  res.redirect('/content/' + req.params.id);
});

exports.runJob = asyncHandler(async (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const wpCreds = {
    username: req.body.wp_user,
    password: req.body.wp_pass,
    applicationPassword: req.body.wp_app_pass
  };
  // Run async — kick off but don't block the response longer than needed.
  service
    .runJob(jobId, { wpCreds })
    .catch(() => { /* errors are surfaced through logs + per-keyword status */ });
  req.flash('info', res.__('content.jobStarted'));
  res.redirect('/content/' + jobId);
});

exports.runKeyword = asyncHandler(async (req, res) => {
  const kid = parseInt(req.params.kid, 10);
  const wpCreds = {
    username: req.body.wp_user,
    password: req.body.wp_pass,
    applicationPassword: req.body.wp_app_pass
  };
  service.runKeyword(kid, { wpCreds }).catch(() => {});
  req.flash('info', res.__('content.keywordStarted'));
  res.redirect('/content/' + req.params.id);
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
