'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const service = require('./site.service');
const v = require('../../utils/validators');

exports.index = asyncHandler(async (req, res) => {
  // Try a live refresh; fall back to local cache so the UI never breaks if EE
  // is offline (helpful while developing on Windows).
  let sites = [];
  let refreshError = null;
  try {
    sites = await service.refreshFromEE(req.session.user.id);
  } catch (e) {
    refreshError = e.message;
    sites = service.listLocal();
  }

  // Lightweight stats for the header strip.
  const stats = {
    total: sites.length,
    active: sites.filter((s) => s.status === 'active').length,
    configuring: sites.filter((s) => s.status === 'configuring').length,
    ssl: sites.filter((s) => s.ssl).length
  };

  res.render('sites/index', {
    title: res.__('sites.title'),
    sites,
    stats,
    refreshError
  });
});

exports.showCreate = function showCreate(req, res) {
  res.render('sites/create', {
    title: res.__('sites.create'),
    values: {}
  });
};

exports.create = asyncHandler(async (req, res) => {
  const {
    domain, title, description, ssl, admin_user, admin_pass, admin_email, category
  } = req.body || {};

  if (!v.isValidDomain(domain)) {
    req.flash('error', res.__('sites.invalidDomain'));
    return res.status(400).render('sites/create', { title: res.__('sites.create'), values: req.body });
  }

  try {
    const result = await service.createFull({
      domain,
      title,
      description,
      ssl: ssl === 'on' || ssl === '1',
      adminUser: admin_user,
      adminPass: admin_pass,
      adminEmail: admin_email,
      category,
      userId: req.session.user.id
    });
    res.render('sites/created', {
      title: res.__('sites.created', { domain: result.site.domain }),
      site: result.site,
      cfg: result.cfg,
      credentials: result.credentials
    });
  } catch (err) {
    req.flash('error', err.message);
    res.status(500).render('sites/create', { title: res.__('sites.create'), values: req.body });
  }
});

exports.detail = asyncHandler(async (req, res) => {
  const domain = req.params.domain;
  v.assertDomain(domain);
  const data = await service.info(domain);
  res.render('sites/detail', {
    title: domain,
    domain,
    local: data.local,
    eeInfo: data.eeInfo,
    table: (data.eeInfo && data.eeInfo.table) || {},
    recentLogs: data.recentLogs || []
  });
});

exports.destroy = asyncHandler(async (req, res) => {
  const domain = req.params.domain;
  await service.remove(domain, req.session.user.id);
  req.flash('success', res.__('sites.deleted', { domain }));
  res.redirect('/sites');
});
