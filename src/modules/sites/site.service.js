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
  let eeInfo = null;
  try {
    eeInfo = await ee.siteInfo(domain);
  } catch (e) {
    eeInfo = { error: e.message };
  }
  return { local, eeInfo };
}

/**
 * Create a brand-new WordPress site end-to-end.
 *
 * Returns BOTH the persisted site row and the credentials used during
 * creation (admin user/email/password). Callers (the controller) decide
 * whether to surface the password in the UI.
 */
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

  // Defaults that match the legacy bash script's intent:
  //   ADMIN_USER="admin"
  //   ADMIN_PASS="$(openssl rand -base64 18)"
  //   ADMIN_EMAIL="admin@$DOMAIN"
  const finalAdminUser  = adminUser  && adminUser.trim()  ? adminUser  : 'admin';
  const finalAdminEmail = adminEmail && adminEmail.trim() ? adminEmail : `admin@${domain}`;
  const generatedPass   = !adminPass || !adminPass.trim();
  const finalAdminPass  = generatedPass ? passwordGenerator.generate(20) : adminPass;
  const siteTitle       = title && title.trim() ? title : domain;

  await logRepo.write({
    level: 'info',
    category: 'sites',
    message: `creating site ${domain}`,
    userId
  });

  // 1) ee site create — also passes --cache, --title, admin-* (matches bash script)
  try {
    await ee.createSite(domain, {
      type: 'wp',
      cache: true,
      ssl,
      title: siteTitle,
      adminUser: finalAdminUser,
      adminPass: finalAdminPass,
      adminEmail: finalAdminEmail
    });
  } catch (err) {
    // Friendlier message for the most common cause: LE certificate-rate-limit.
    // EasyEngine rolls back the whole site when SSL acquisition fails, so the
    // user needs to know to either wait, change subdomain, or skip SSL.
    const txt = (err && err.message) || '';
    if (/rateLimited|too many certificates/i.test(txt)) {
      const friendly = new Error(
        `Let's Encrypt rate limit hit for "${domain}" (5 certs / 7 days per exact ` +
        `domain set). EasyEngine rolled the site back. Re-create WITHOUT SSL ` +
        `and add it later with \`ee site update ${domain} --ssl=le\`, OR use a ` +
        `different subdomain. Original: ${txt}`
      );
      friendly.cause = err;
      throw friendly;
    }
    throw err;
  }

  // Persist a record immediately so the UI shows progress.
  repo.upsert({
    domain,
    site_type: 'wp',
    ssl: ssl ? 1 : 0,
    status: 'configuring',
    title: siteTitle,
    description,
    created_by: userId || null
  });

  // 2) WP configuration via the persisted site template
  const cfg = await wp.configureNewSite(domain, {
    title: siteTitle,
    description,
    category
  });

  repo.upsert({
    domain,
    status: 'active',
    title: siteTitle,
    description,
    created_by: userId || null
  });

  await logRepo.write({
    level: 'info',
    category: 'sites',
    message: `site ${domain} configured`,
    meta: cfg,
    userId
  });

  return {
    site: repo.findByDomain(domain),
    cfg,
    credentials: {
      url: `${ssl ? 'https' : 'http'}://${domain}`,
      adminUrl: `${ssl ? 'https' : 'http'}://${domain}/wp-admin`,
      user: finalAdminUser,
      password: finalAdminPass,
      email: finalAdminEmail,
      passwordGenerated: generatedPass
    }
  };
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
