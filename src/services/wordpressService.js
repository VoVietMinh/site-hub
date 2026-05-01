'use strict';

const { runEE: run, runEEOrThrow: runOrThrow } = require('./eeBridge');
const v = require('../utils/validators');
const siteTemplate = require('./siteTemplate');

function shellQuote(arg) {
  var s = String(arg);
  if (/^[A-Za-z0-9_./:=,\-]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function buildWpCommand(wpArgv) {
  return ['wp'].concat(wpArgv).concat(['--allow-root']).map(shellQuote).join(' ');
}

async function wp(domain, wpArgv, opts) {
  opts = opts || {};
  v.assertDomain(domain);
  if (!Array.isArray(wpArgv) || wpArgv.length === 0) {
    throw new Error('wpArgv must be a non-empty array');
  }
  const command = buildWpCommand(wpArgv);
  return runOrThrow(
    ['shell', domain, '--command=' + command],
    { category: 'wp-cli', timeoutMs: opts.timeoutMs || 10 * 60 * 1000 }
  );
}

async function wpSoft(domain, wpArgv, opts) {
  opts = opts || {};
  v.assertDomain(domain);
  const command = buildWpCommand(wpArgv);
  return run(
    ['shell', domain, '--command=' + command],
    { category: 'wp-cli', timeoutMs: opts.timeoutMs || 10 * 60 * 1000 }
  );
}

async function safeOptionUpdate(domain, key, value) {
  const r = await wpSoft(domain, ['option', 'update', key, value]);
  if (r.code === 0) return r;
  if (/Could not update option/i.test(r.stderr)) return r;
  const msg = (r.stderr || r.stdout || '').trim();
  const err = new Error('wp option update ' + key + ' failed: ' + msg);
  err.result = r;
  throw err;
}

async function setSiteOptions(domain, opts) {
  if (opts.title)       await safeOptionUpdate(domain, 'blogname', opts.title);
  if (opts.description) await safeOptionUpdate(domain, 'blogdescription', opts.description);
}

async function applyOptionMap(domain, options) {
  options = options || {};
  for (const k of Object.keys(options)) {
    const val = options[k];
    if (val === null || val === undefined) continue;
    await safeOptionUpdate(domain, k, String(val));
  }
}

function isHarmlessInstallNoop(stderr) {
  return /already installed|destination folder already exists/i.test(stderr || '');
}
function isHarmlessActivateNoop(stderr) {
  return /already active/i.test(stderr || '');
}

async function installTheme(domain, slug, opts) {
  opts = opts || {};
  const activate = opts.activate !== false;
  const inst = await wpSoft(domain, ['theme', 'install', slug]);
  if (inst.code !== 0 && !isHarmlessInstallNoop(inst.stderr)) {
    const err = new Error('theme install ' + slug + ' failed: ' + (inst.stderr || inst.stdout).trim());
    err.result = inst;
    throw err;
  }
  if (activate) {
    const act = await wpSoft(domain, ['theme', 'activate', slug]);
    if (act.code !== 0 && !isHarmlessActivateNoop(act.stderr)) {
      const err = new Error('theme activate ' + slug + ' failed: ' + (act.stderr || act.stdout).trim());
      err.result = act;
      throw err;
    }
  }
  return { installed: inst, activated: activate };
}

async function installPlugins(domain, slugs, opts) {
  opts = opts || {};
  const activate = opts.activate !== false;
  if (!Array.isArray(slugs) || slugs.length === 0) return [];
  const results = [];
  for (const slug of slugs) {
    const inst = await wpSoft(domain, ['plugin', 'install', slug]);
    const installOk = inst.code === 0 || isHarmlessInstallNoop(inst.stderr);
    if (!installOk) {
      results.push({ slug: slug, ok: false, error: (inst.stderr || inst.stdout).trim() });
      continue;
    }
    if (!activate) { results.push({ slug: slug, ok: true }); continue; }
    const act = await wpSoft(domain, ['plugin', 'activate', slug]);
    const activateOk = act.code === 0 || isHarmlessActivateNoop(act.stderr);
    if (!activateOk) {
      results.push({ slug: slug, ok: false, error: (act.stderr || act.stdout).trim() });
    } else {
      results.push({ slug: slug, ok: true });
    }
  }
  return results;
}

async function ensureCategory(domain, name) {
  if (!name) return null;
  const r = await wpSoft(domain, ['term', 'create', 'category', name, '--porcelain']);
  return r.stdout.trim();
}

async function findPageBySlug(domain, slug) {
  const r = await wp(domain, ['post', 'list', '--post_type=page', '--name=' + slug, '--field=ID']);
  const lines = r.stdout.trim().split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
  if (!lines.length) return null;
  const id = parseInt(lines[lines.length - 1], 10);
  return Number.isFinite(id) ? id : null;
}

async function createOrUpdatePage(domain, page) {
  const existing = await findPageBySlug(domain, page.slug);
  if (existing) {
    await wp(domain, ['post', 'update', String(existing),
      '--post_title=' + page.title, '--post_content=' + page.content]);
    return existing;
  }
  const r = await wp(domain, ['post', 'create', '--post_type=page', '--post_status=publish',
    '--post_title=' + page.title, '--post_name=' + page.slug,
    '--post_content=' + page.content, '--porcelain']);
  return parseInt(r.stdout.trim(), 10);
}

async function createPage(domain, page) {
  const r = await wp(domain, ['post', 'create', '--post_type=page',
    '--post_status=' + (page.status || 'publish'),
    '--post_title=' + page.title,
    '--post_content=' + (page.content || ''),
    '--porcelain']);
  return parseInt(r.stdout.trim(), 10);
}

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
  if (menuTitle) args.push('--title=' + menuTitle);
  return wp(domain, args);
}

async function getFirstMenuLocation(domain) {
  try {
    const r = await wp(domain, ['menu', 'location', 'list', '--format=csv']);
    const lines = r.stdout.trim().split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
    if (lines.length < 2) return null;
    const firstCol = (lines[1].split(',')[0] || '').replace(/^"|"$/g, '').trim();
    return firstCol || null;
  } catch (_) { return null; }
}

async function assignMenuToLocation(domain, menuName, location) {
  if (!location) return null;
  return wp(domain, ['menu', 'location', 'assign', menuName, location]);
}

// ---------------------------------------------------------------------------
// Blog post creation (used by content generation pipeline)
// ---------------------------------------------------------------------------
/**
 * Create a new blog post via WP-CLI. Returns { id, link }.
 * Category is best-effort: if slug lookup fails the post is still created.
 */
async function createPost(domain, opts) {
  opts = opts || {};
  var title    = opts.title   || '';
  var content  = opts.content || '';
  var status   = opts.status  || 'publish';
  var category = opts.category || null;

  var args = [
    'post', 'create',
    '--post_type=post',
    '--post_status=' + status,
    '--post_title=' + title,
    '--post_content=' + content,
    '--porcelain'
  ];

  var r = await wp(domain, args);
  var id = parseInt(r.stdout.trim(), 10);
  if (!Number.isFinite(id)) {
    throw new Error('createPost: unexpected output: ' + r.stdout.trim());
  }

  // Assign category by slug (best-effort)
  if (category) {
    await wpSoft(domain, ['post', 'term', 'add', String(id), 'category', String(category)]);
  }

  // Fetch the public permalink
  var lr = await wpSoft(domain, ['post', 'get', String(id), '--field=link']);
  return { id: id, link: lr.stdout.trim() };
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
async function getAdminPassword(domain) {
  const r = await run(['site', 'info', domain], { category: 'easyengine' });
  return r.stdout;
}

/**
 * Configure a new (or existing) WordPress site from the persisted template.
 * Steps: options -> theme -> plugins -> pages -> menu (best-effort, warns on failure).
 */
async function configureNewSite(domain, opts) {
  opts = opts || {};
  const tpl         = siteTemplate.load();
  const websiteName = opts.title       || domain;
  const description = opts.description || '';
  const vars        = { domain: domain, websiteName: websiteName, description: description };
  const warnings    = [];

  await setSiteOptions(domain, { title: websiteName, description: description });
  await applyOptionMap(domain, tpl.options || {});
  await installTheme(domain, tpl.theme, { activate: true });
  const pluginResults = await installPlugins(domain, tpl.plugins || [], { activate: true });
  if (opts.category) await ensureCategory(domain, opts.category);

  const pageRecords = [];
  for (const page of (tpl.pages || [])) {
    const id = await createOrUpdatePage(domain, {
      slug:    page.slug,
      title:   siteTemplate.applyTemplate(page.title, vars),
      content: siteTemplate.applyTemplate(page.content, vars)
    });
    if (Number.isFinite(id)) {
      pageRecords.push({
        id:        id,
        slug:      page.slug,
        menuTitle: siteTemplate.applyTemplate(page.menuTitle || page.title, vars)
      });
    }
  }

  const menuName = tpl.menuName || 'Main Menu';
  let menuId       = null;
  let menuLocation = null;

  try {
    await deleteMenuByName(domain, menuName);
    menuId = await createMenu(domain, menuName);
    for (const p of pageRecords) {
      await addItemToMenu(domain, menuName, p.id, p.menuTitle);
    }
    menuLocation = await getFirstMenuLocation(domain);
    if (menuLocation) {
      await assignMenuToLocation(domain, menuName, menuLocation);
    } else {
      warnings.push('No menu location found in theme — menu created but not assigned to a location.');
    }
  } catch (menuErr) {
    warnings.push('Menu setup skipped: ' + menuErr.message);
  }

  await flushCache(domain).catch(function() {});
  await flushRewrite(domain);

  return {
    theme:        tpl.theme,
    plugins:      pluginResults,
    pages:        pageRecords,
    menuName:     menuName,
    menuId:       menuId,
    menuLocation: menuLocation || null,
    warnings:     warnings
  };
}

module.exports = {
  wp, wpSoft, setSiteOptions, applyOptionMap,
  installTheme, installPlugins, ensureCategory,
  findPageBySlug, createOrUpdatePage, createPage,
  deleteMenuByName, createMenu, addItemToMenu,
  getFirstMenuLocation, assignMenuToLocation,
  createPost,
  flushRewrite, flushCache, getSiteUrl, getAdminPassword,
  configureNewSite
};
