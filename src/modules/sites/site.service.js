'use strict';

/**
 * Site orchestration: combines EasyEngine + WP-CLI + local DB cache.
 */

const ee = require('../../services/easyengineService');
const wp = require('../../services/wordpressService');
const repo = require('./site.repository');
const v = require('../../utils/validators');
const logRepo = require('../logs/log.repository');

async function refreshFromEE(userId) {
  const list = await ee.listSites();
  for (const s of list) {
    const domain = s.site || s.domain || s.url || s.Site || s['site-url'];
    if (!domain) continue;
    repo.upsert({
      domain,
      site_type: s.site_type || s.type || 'wp',
      ssl: !!(s.ssl || s.SSL || s.https),
      status: s.status || s.Status || 'active',
      created_by: userId || null
    });
  }
  return repo.listAll();
}

function listLocal() {
  return repo.listAll();
}

async function info(domain) {
  v.assertDomain(domain);
  const local = repo.findByDomain(domain);
  let eeInfo = null;
  try {
    eeInfo = await ee.siteInfo(domain);
  } catch (e) {
    eeInfo = { error: e.message };
  }
  return { local, eeInfo };
}

async function createFull({
  domain,
  title,
  description,
  ssl = false,
  adminUser,
  adminPass,
  adminEmail,
  category = 'Blog',
  userId
}) {
  v.assertDomain(domain);

  await logRepo.write({
    level: 'info',
    category: 'sites',
    message: `creating site ${domain}`,
    userId
  });

  // 1) ee site create
  await ee.createSite(domain, { type: 'wp', ssl, adminUser, adminPass, adminEmail });

  // Persist a record immediately so the UI shows progress.
  repo.upsert({
    domain,
    site_type: 'wp',
    ssl: ssl ? 1 : 0,
    status: 'configuring',
    title,
    description,
    created_by: userId || null
  });

  // 2) WP configuration
  const cfg = await wp.configureNewSite(domain, { title, description, category });

  repo.upsert({ domain, status: 'active', title, description, created_by: userId || null });

  await logRepo.write({
    level: 'info',
    category: 'sites',
    message: `site ${domain} configured`,
    meta: cfg,
    userId
  });

  return repo.findByDomain(domain);
}

async function remove(domain, userId) {
  v.assertDomain(domain);
  await ee.deleteSite(domain);
  repo.remove(domain);
  await logRepo.write({
    level: 'info',
    category: 'sites',
    message: `site ${domain} deleted`,
    userId
  });
  return true;
}

module.exports = { refreshFromEE, listLocal, info, createFull, remove };
