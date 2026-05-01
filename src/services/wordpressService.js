'use strict';

/**
 * WordPress configuration via WP-CLI through EasyEngine.
 *
 * Every WP-CLI invocation flows:
 *   panel container
 *     → eeBridge (ssh root@host)
 *     → ee shell <domain> --command="wp <argv...> --allow-root"
 *     → wp-cli inside the site's php container
 *
 * We append `--allow-root` automatically because EE's shell runs as root and
 * WP-CLI refuses to run as root without it.
 *
 * Safety: every wp arg is single-quoted (POSIX-style with `'\''` escape) so
 * the shell that EE spawns inside the site container can't be tricked by
 * user input — even with HTML page content full of quotes and angle brackets.
 */

const { runEE: run, runEEOrThrow: runOrThrow } = require('./eeBridge');
const v = require('../utils/validators');
const siteTemplate = require('./siteTemplate');

// ---------------------------------------------------------------------------
// Inner shell quoting
// ---------------------------------------------------------------------------
function shellQuote(arg) {
  const s = String(arg);
  if (/^[A-Za-z0-9_./:=,\-]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function buildWpCommand(wpArgv) {
  // --allow-root is appended once at the end of every wp invocation
  return ['wp', ...wpArgv, '--allow-root'].map(shellQuote).join(' ');
}

// ---------------------------------------------------------------------------
// Core wrapper
// ---------------------------------------------------------------------------
async function wp(domain, wpArgv, opts = {}) {
  v.assertDomain(domain);
  if (!Array.isArray(wpArgv) || !wpArgv.length) {
    throw new Error('wpArgv must be a non-empty array');
  }
  const command = buildWpCommand(wpArgv);
  return runOrThrow(
    ['shell', domain, `--command=${command}`],
    { category: 'wp-cli', timeoutMs: opts.timeoutMs || 10 * 60 * 1000 }
  );
}

/**
 * Like `wp()` but never throws on non-zero exit — useful for `term create`
 * (already-exists) and `menu delete` (not-found).
 */
async function wpSoft(domain, wpArgv, opts = {}) {
  v.assertDomain(domain);
  const command = buildWpCommand(wpArgv);
  return run(
    ['shell', domain, `--command=${command}`],
    { category: 'wp-cli', timeoutMs: opts.timeoutMs || 10 * 60 * 1000 }
  );
}

// ---------------------------------------------------------------------------
// Site-wide options
// ---------------------------------------------------------------------------

/**
 * `wp option update` returns exit 1 with stderr "Could not update option 'X'"
 * when the new value equals the current value (it's a no-op, not a failure).
 * We treat that case as success and only surface other non-zero exits.
 */
async function safeOptionUpdate(domain, key, value) {
  const r = await wpSoft(domain, ['option', 'update', key, value]);
  if (r.code === 0) return r;
  if (/Could not update option/i.test(r.stderr)) return r; // value already matches
  const msg = (r.stderr || r.stdout || '').trim();
  const err = new Error(`wp option update ${key} failed: ${msg}`);
  err.result = r;
  throw err;
}

async function setSiteOptions(domain, { title, description }) {
  if (title) await safeOptionUpdate(domain, 'blogname', title);
  if (description) await safeOptionUpdate(domain, 'blogdescription', description);
}

async function applyOptionMap(domain, options = {}) {
  for (const [k, v_] of Object.entries(options)) {
    if (v_ === null || v_ === undefined) continue;
    await safeOptionUpdate(domain, k, String(v_));
  }
}

// ---------------------------------------------------------------------------
// Theme + plugins
// ---------------------------------------------------------------------------
/**
 * Already-installed / already-active are not real errors. WP-CLI exits 1 in
 * those cases — we squash them so re-running create on an existing site
 * stays idempotent.
 */
function isHarmlessInstallNoop(stderr) {
  return /already installed|already active|destination folder already exists/i
    .test(stderr || '');
}

async function installTheme(domain, slug, { activate = true } = {}) {
  const args = ['theme', 'install', slug];
  if (activate) args.push('--activate');
  const r = await wpSoft(domain, args);
  if (r.code !== 0 && !isHarmlessInstallNoop(r.stderr)) {
    const err = new Error(`theme install ${slug} failed: ${(r.stderr || r.stdout).trim()}`);
    err.result = r; throw err;
  }
  return r;
}

/**
 * Install plugins one-at-a-time so a single bad slug doesn't abort the rest.
 */
async function installPlugins(domain, slugs, { activate = true } = {}) {
  if (!Array.isArray(slugs) || !slugs.length) return [];
  const results = [];
  for (const slug of slugs) {
    const args = ['plugin', 'install', slug];
    if (activate) args.push('--activate');
    const r = await wpSoft(domain, args);
    if (r.code === 0 || isHarmlessInstallNoop(r.stderr)) {
      results.push({ slug, ok: true });
    } else {
      results.push({ slug, ok: false, error: (r.stderr || r.stdout).trim() });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Categories + pages (idempotent)
// ---------------------------------------------------------------------------
async function ensureCategory(domain, name) {
  if (!name) return null;
  const r = await wpSoft(domain, ['term', 'create', 'category', name, '--porcelain']);
  return r.stdout.trim();
}

async function findPageBySlug(domain, slug) {
  const r = await wp(domain, ['post', 'list', '--post_type=page', `--name=${slug}`, '--field=ID']);
  const lines = r.stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  // wp-cli sometimes prints a leading "Success: …" line — take the last numeric line.
  const last = lines[lines.length - 1];
  const id = parseInt(last, 10);
  return Number.isFinite(id) ? id : null;
}

async function createOrUpdatePage(domain, { slug, title, content }) {
  const existing = await findPageBySlug(domain, slug);
  if (existing) {
    await wp(domain, [
      'post', 'update', String(existing),
      `--post_title=${title}`,
      `--post_content=${content}`
    ]);
    return existing;
  }
  const r = await wp(domain, [
    'post', 'create',
    '--post_type=page',
    '--post_status=publish',
    `--post_title=${title}`,
    `--post_name=${slug}`,
    `--post_content=${content}`,
    '--porcelain'
  ]);
  return parseInt(r.stdout.trim(), 10);
}

// Legacy method kept for backward compatibility (used by the older tests).
async function createPage(domain, { title, content = '', status = 'publish' }) {
  const r = await wp(domain, [
    'post', 'create',
    '--post_type=page',
    `--post_status=${status}`,
    `--post_title=${title}`,
    `--post_content=${content}`,
    '--porcelain'
  ]);
  return parseInt(r.stdout.trim(), 10);
}

// ---------------------------------------------------------------------------
// Menu (idempotent: delete-then-create + auto-locate theme menu slot)
// ---------------------------------------------------------------------------
async function deleteMenuByName(domain, name) {
  const r = await wpSoft(domain, ['menu', 'delete', name]);
  return r.code === 0;
}

async function createMenu(domain, name) {
  const r = await wp(domain, ['menu', 'create', name, '--porcelain']);
  return parseInt(r.stdout.trim(), 10);
}

async function addItemToMenu(domain, menuName, postId, menuTitle) {
  const args = ['menu', 'item', 'add-post', menuName, String(postId)];
  if (menuTitle) args.push(`--title=${menuTitle}`);
  return wp(domain, args);
}

async function getFirstMenuLocation(domain) {
  try {
    const r = await wp(domain, [
      'menu', 'location', 'list', '--fields=location', '--format=csv'
    ]);
    const lines = r.stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;
    // CSV header on line 0; first real value on line 1
    const first = lines[1].replace(/^"|"$/g, '');
    return first || null;
  } catch (_) {
    return null;
  }
}

async function assignMenuToLocation(domain, menuName, location) {
  if (!location) return null;
  return wp(domain, ['menu', 'location', 'assign', menuName, location]);
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------
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
async function getAdminPassword(domain) {
  const r = await run(['site', 'info', domain], { category: 'easyengine' });
  return r.stdout;
}

// ---------------------------------------------------------------------------
// Full onboarding pipeline
// ---------------------------------------------------------------------------
/**
 * Configure a brand-new (or already-existing) WordPress site according to
 * the persisted siteTemplate. Idempotent: safe to re-run.
 *
 * @param {string} domain
 * @param {{ title?: string, description?: string, category?: string }} opts
 * @returns {Promise<object>}  summary of work done
 */
async function configureNewSite(domain, opts = {}) {
  const tpl = siteTemplate.load();
  const websiteName = opts.title || domain;
  const description = opts.description || '';
  const vars = { domain, websiteName, description };

  // 1) Site identity + global options
  await setSiteOptions(domain, { title: websiteName, description });
  await applyOptionMap(domain, tpl.options || {});

  // 2) Theme
  await installTheme(domain, tpl.theme, { activate: true });

  // 3) Plugins
  const pluginResults = await installPlugins(domain, tpl.plugins || [], { activate: true });

  // 4) Default category
  if (opts.category) await ensureCategory(domain, opts.category);

  // 5) Pages with placeholder substitution + slug-based idempotency
  const pageRecords = [];
  for (const page of tpl.pages || []) {
    const renderedTitle = siteTemplate.applyTemplate(page.title, vars);
    const renderedContent = siteTemplate.applyTemplate(page.content, vars);
    const id = await createOrUpdatePage(domain, {
      slug: page.slug,
      title: renderedTitle,
      content: renderedContent
    });
    if (Number.isFinite(id)) {
      pageRecords.push({
        id,
        slug: page.slug,
        menuTitle: siteTemplate.applyTemplate(page.menuTitle || page.title, vars)
      });
    }
  }

  // 6) Menu — delete-then-create so re-runs don't duplicate
  const menuName = tpl.menuName || 'Main Menu';
  await deleteMenuByName(domain, menuName);
  const menuId = await createMenu(domain, menuName);
  for (const p of pageRecords) {
    await addItemToMenu(domain, menuName, p.id, p.menuTitle);
  }

  // 7) Auto-detect theme's primary menu location and assign there
  const menuLocation = await getFirstMenuLocation(domain);
  if (menuLocation) {
    await assignMenuToLocation(domain, menuName, menuLocation);
  }

  // 8) Caches
  await flushCache(domain).catch(() => {});
  await flushRewrite(domain);

  return {
    theme: tpl.theme,
    plugins: pluginResults,
    pages: pageRecords,
    menuName,
    menuId,
    menuLocation: menuLocation || null
  };
}

module.exports = {
  wp,
  wpSoft,
  setSiteOptions,
  applyOptionMap,
  installTheme,
  installPlugins,
  ensureCategory,
  findPageBySlug,
  createOrUpdatePage,
  createPage,
  deleteMenuByName,
  createMenu,
  addItemToMenu,
  getFirstMenuLocation,
  assignMenuToLocation,
  flushRewrite,
  flushCache,
  getSiteUrl,
  getAdminPassword,
  configureNewSite
};
