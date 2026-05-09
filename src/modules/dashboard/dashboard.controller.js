'use strict';

const sitesRepo = require('../sites/site.repository');
const contentRepo = require('../content/content.repository');
const logRepo = require('../logs/log.repository');

exports.index = async function index(req, res) {
  const [sites, jobs, recentLogs] = await Promise.all([
    sitesRepo.listAll(),
    contentRepo.listJobs(),
    logRepo.list({ limit: 12, offset: 0 })
  ]);
  const totalKeywords = jobs.reduce((acc, j) => acc + (j.num_keywords || 0), 0);

  res.render('dashboard/index', {
    title: res.__('dashboard.title'),
    sites,
    jobs,
    totalKeywords,
    recentLogs
  });
};
