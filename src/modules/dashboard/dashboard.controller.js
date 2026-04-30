'use strict';

const sitesRepo = require('../sites/site.repository');
const contentRepo = require('../content/content.repository');
const logRepo = require('../logs/log.repository');

exports.index = function index(req, res) {
  const sites = sitesRepo.listAll();
  const jobs = contentRepo.listJobs();
  const totalKeywords = jobs.reduce((acc, j) => acc + (j.num_keywords || 0), 0);
  const recentLogs = logRepo.list({ limit: 12, offset: 0 });

  res.render('dashboard/index', {
    title: res.__('dashboard.title'),
    sites,
    jobs,
    totalKeywords,
    recentLogs
  });
};
