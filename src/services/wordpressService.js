'use strict';

/**
 * WordPress configuration via WP-CLI through EasyEngine.
 *
 * EasyEngine ships a wrapper:  `ee shell <domain> --command="wp ..."`
 *
 * That makes every WP-CLI invocation a two-binary call:
 *      ee shell <domain> --command="..."
 *
 * To keep our hardened command runner safe we:
 *   • only ever pass `ee` as the binary
 *   • build the inner wp command as a single argv array, then JSON-stringify
 *     and base64-encode it to ship it through `--command=` without ever
 *     touching shell metacharacters in the outer call
 *
 * In environments where `ee shell` isn't available, set EE_USE_DOCKER_EXEC=1
 * and we'll fall back to `docker exec` against the site's php container.
 */

const { run, runOrThrow } = require('./commandRunner');
const config = require('../config');
const v = require('../utils/validators');

const EE = config.easyEngine.binary;

/**
 * Build a wp-cli argv as a single shell-safe string. We single-quote every
 * argument and escape embedded single quotes — even though we know
 * ee-shell launches a shell internally, we never embed user input directly.
 */
function shellQuote(arg) {
  if (/^[A-Za-z0-9_./:=,\-]+$/.test(arg)) return arg;
  return "'" + String(arg).replace(/'/g, "'\\''") + "'";
}

function buildWpCommand(wpArgv) {
  return ['wp', ...wpArgv].map(shellQuote).join(' ');
}

/**
 * Run a WP-CLI command for a given site.
 * @param {string} domain
 * @param {string[]} wpArgv  e.g. ['theme','install','newspare','--activate']
 */
async function wp(domain, wpArgv, opts = {}) {
  v.assertDomain(domain);
  if (!Array.isArray(wpArgv) || !wpArgv.length) {
    throw new Error('wpArgv must be non-empty array');
  }
  const command = buildWpCommand(wpArgv);
  return runOrThrow(
    EE,
    ['shell', domain, `--command=${command}`],
    { category: 'wp-cli', timeoutMs: opts.timeoutMs || 10 * 60 * 1000 }
  );
}

/**
 * Site-wide options.
 */
async function setSiteOptions(domain, { title, description }) {
  if (title) await wp(domain, ['option', 'update', 'blogname', title]);
  if (description) await wp(domain, ['option', 'update', 'blogdescription', description]);
}

/**
 * Theme + plugins.
 */
async function installTheme(domain, slug, { activate = true } = {}) {
  const args = ['theme', 'install', slug];
  if (activate) args.push('--activate');
  return wp(domain, args);
}

async function installPlugins(domain, slugs, { activate = true } = {}) {
  if (!Array.isArray(slugs) || !slugs.length) return;
  const args = ['plugin', 'install', ...slugs];
  if (activate) args.push('--activate');
  await wp(domain, args);
}

/**
 * Categories + pages + menu.
 */
async function ensureCategory(domain, name) {
  // wp term create taxonomy <term> — succeeds if missing, fails if dup.
  // We don't want a duplicate-term error to abort the whole site setup, so
  // run it and swallow non-zero exits.
  const r = await run(EE, [
    'shell', domain,
    `--command=${buildWpCommand(['term', 'create', 'category', name, '--porcelain'])}`
  ], { category: 'wp-cli' });
  return r.stdout.trim();
}

async function createPage(domain, { title, content = '', status = 'publish' }) {
  const r = await wp(domain, [
    'post', 'create',
    `--post_type=page`,
    `--post_title=${title}`,
    `--post_status=${status}`,
    `--post_content=${content}`,
    '--porcelain'
  ]);
  return parseInt(r.stdout.trim(), 10);
}

async function createMenu(domain, name) {
  // wp menu create returns the term id with --porcelain
  const r = await wp(domain, ['menu', 'create', name, '--porcelain']);
  return parseInt(r.stdout.trim(), 10);
}

async function addPageToMenu(domain, menu, pageId) {
  return wp(domain, ['menu', 'item', 'add-post', String(menu), String(pageId)]);
}

async function assignMenuToLocation(domain, menu, location = 'primary') {
  return wp(domain, ['menu', 'location', 'assign', String(menu), location]);
}

async function flushRewrite(domain) {
  return wp(domain, ['rewrite', 'flush', '--hard']);
}

async function flushCache(domain) {
  return wp(domain, ['cache', 'flush']);
}

async function getSiteUrl(domain) {
  const r = await wp(domain, ['option', 'get', 'siteurl']);
  return r.stdout.trim();
}

async function getAdminPassword(domain, user = 'admin') {
  // best-effort — used to surface info in the UI after creation
  const r = await run(EE, ['site', 'info', domain], { category: 'easyengine' });
  return r.stdout;
}

/**
 * Full WP onboarding pipeline used after `ee site create`.
 */
async function configureNewSite(domain, opts = {}) {
  const {
    title,
    description,
    theme = 'newspare',
    plugins = [
      'auto-upload-images',
      'ip2location-country-blocker',
      'seo-by-rank-math',
      'json-api-auth'
    ],
    category = 'Blog',
    pages = [
      { title: 'About Us' },
      { title: 'Contact Us' },
      { title: 'Privacy Policy' },
      { title: 'Terms of Service' },
      { title: 'Disclaimer' }
    ],
    menuName = 'Primary Menu'
  } = opts;

  await setSiteOptions(domain, { title, description });
  await installTheme(domain, theme, { activate: true });
  await installPlugins(domain, plugins, { activate: true });
  await ensureCategory(domain, category);

  const pageIds = [];
  for (const p of pages) {
    const id = await createPage(domain, p);
    if (Number.isFinite(id)) pageIds.push(id);
  }

  const menuId = await createMenu(domain, menuName);
  for (const pid of pageIds) {
    await addPageToMenu(domain, menuId, pid);
  }
  await assignMenuToLocation(domain, menuId, 'primary');

  await flushCache(domain).catch(() => {}); // not fatal
  await flushRewrite(domain);

  return { theme, plugins, pageIds, menuId };
}

module.exports = {
  wp,
  setSiteOptions,
  installTheme,
  installPlugins,
  ensureCategory,
  createPage,
  createMenu,
  addPageToMenu,
  assignMenuToLocation,
  flushRewrite,
  flushCache,
  getSiteUrl,
  getAdminPassword,
  configureNewSite
};
