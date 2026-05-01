'use strict';

/**
 * Site orchestration: combines EasyEngine + WP-CLI + local DB cache.
 */

const ee = require('../../services/easyengineService');
const wp = require('../../services/wordpressService');
const repo = require('./site.repository');
const v = require('../../utils/validators');
const logRepo = require('../logs/log.repository');
const passwordGenerator = require('../../utils/passwordGenerator');

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

  let eeInfo = { raw: null, table: {}, json: null, error: null };
  try {
    eeInfo = await ee.siteInfo(domain);
  } catch (e) {
    eeInfo.error = e.message;
  }

  let recentLogs = [];
  try {
    recentLogs = logRepo.searchByMessage(domain, 30);
  } catch (_) {}

  return { local, eeInfo, recentLogs };
}

async function createFull({
  domain, title, description, ssl = false,
  adminUser, adminPass, adminEmail, category = 'Blog', userId
}) {
  v.assertDomain(domain);

  const finalAdminUser  = adminUser  && adminUser.trim()  ? adminUser  : 'admin';
  const finalAdminEmail = adminEmail && adminEmail.trim() ? adminEmail : ('admin@' + domain);
  const generatedPass   = !adminPass || !adminPass.trim();
  const finalAdminPass  = generatedPass ? passwordGenerator.generate(20) : adminPass;
  const siteTitle       = title && title.trim() ? title : domain;

  await logRepo.write({ level: 'info', category: 'sites',
    message: 'creating site ' + domain, userId });

  try {
    await ee.createSite(domain, {
      type: 'wp', cache: true, ssl,
      title: siteTitle, adminUser: finalAdminUser,
      adminPass: finalAdminPass, adminEmail: finalAdminEmail
    });
  } catch (err) {
    const txt = (err && err.message) || '';
    if (/rateLimited|too many certificates/i.test(txt)) {
      const friendly = new Error(
        'Let\'s Encrypt rate limit hit for "' + domain + '" (5 certs / 7 days per exact ' +
        'domain set). EasyEngine rolled the site back. Re-create WITHOUT SSL ' +
        'and add it later with `ee site update ' + domain + ' --ssl=le`, OR use a ' +
        'different subdomain. Original: ' + txt
      );
      friendly.cause = err;
      throw friendly;
    }
    throw err;
  }

  repo.upsert({
    domain, site_type: 'wp', ssl: ssl ? 1 : 0,
    status: 'configuring', title: siteTitle, description, created_by: userId || null
  });

  const cfg = await wp.configureNewSite(domain, { title: siteTitle, description, category });

  repo.upsert({
    domain, status: 'active', title: siteTitle, description,
    created_by: userId || null,
    wp_user: finalAdminUser,
    wp_pass: finalAdminPass
  });

  await logRepo.write({ level: 'info', category: 'sites',
    message: 'site ' + domain + ' configured', meta: cfg, userId });

  return {
    site: repo.findByDomain(domain),
    cfg,
    credentials: {
      url:              (ssl ? 'https' : 'http') + '://' + domain,
      adminUrl:         (ssl ? 'https' : 'http') + '://' + domain + '/wp-admin',
      user:             finalAdminUser,
      password:         finalAdminPass,
      email:            finalAdminEmail,
      passwordGenerated: generatedPass
    }
  };
}

async function updateCredentials(domain, wp_user, wp_pass) {
  v.assertDomain(domain);
  return repo.updateCredentials(domain, wp_user || null, wp_pass || null);
}

async function remove(domain, userId) {
  v.assertDomain(domain);
  await ee.deleteSite(domain);
  repo.remove(domain);
  await logRepo.write({ level: 'info', category: 'sites',
    message: 'site ' + domain + ' deleted', userId });
  return true;
}

module.exports = { refreshFromEE, listLocal, info, createFull, updateCredentials, remove };
