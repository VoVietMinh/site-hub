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
  return /already installed|destination folder already exists/i.test(stderr || '');
}
function isHarmlessActivateNoop(stderr) {
  return /already active/i.test(stderr || '');
}

/**
 * Install + activate as two separate steps. Combining them with
 * `--activate` skips activation when the install short-circuits because the
 * folder already exists, which is exactly the case where activation matters
 * most (re-running create on an existing site).
 */
async function installTheme(domain, slug, { activate = true } = {}) {
  // 1) install (tolerant of "already installed")
  const inst = await wpSoft(domain, ['theme', 'install', slug]);
  if (inst.code !== 0 && !isHarmlessInstallNoop(inst.stderr)) {
    const err = new Error(`theme install ${slug} failed: ${(inst.stderr || inst.stdout).trim()}`);
    err.result = inst; throw err;
  }

  // 2) activate (tolerant of "already active")
  if (activate) {
    const act = await wpSoft(domain, ['theme', 'activate', slug]);
    if (act.code !== 0 && !isHarmlessActivateNoop(act.stderr)) {
      const err = new Error(`theme activate ${slug} failed: ${(act.stderr || act.stdout).trim()}`);
      err.result = act; throw err;
    }
  }
  return { installed: inst, activated: activate };
}

/**
 * Install plugins one-at-a-time so a single bad slug doesn't abort the rest.
 * Like installTheme, install and activate are separate steps so activation
 * runs even when the plugin folder already exists.
 */
async function installPlugins(domain, slugs, { activate = true } = {}) {
  if (!Array.isArray(slugs) || !slugs.length) return [];
  const results = [];
  for (const slug of slugs) {
    const inst = await wpSoft(domain, ['plugin', 'install', slug]);
    const installOk = inst.code === 0 || isHarmlessInstallNoop(inst.stderr);
    if (!installOk) {
      results.push({ slug, ok: false, error: (inst.stderr || inst.stdout).trim() });
      continue;
    }
    if (!activate) { results.push({ slug, ok: true }); continue; }

    const act = await wpSoft(domain, ['plugin', 'activate', slug]);
    const activateOk = act.code === 0 || isHarmlessActivateNoop(act.stderr);
    if (!activateOk) {
      results.push({ slug, ok: false, error: (act.stderr || act.stdout).trim() });
    } else {
      results.push({ slug, ok: true });
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
  // `wp menu location list` does NOT support --fields; it only ever has one
  // field anyway. We pull CSV, drop the header row, and take the first
  // column of the first data row.
  try {
    const r = await wp(domain, ['menu', 'location', 'list', '--format=csv']);
    const lines = r.stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return null; // header only — no menu locations declared
    const firstRow = lines[1];
    const firstCol = firstRow.split(',')[0] || '';
    const cleaned = firstCol.replace(/^"|"$/g, '').trim();
    return cleaned || null;
  } catch (_) {
    return null;
  }
}

async function assignMenuToLocation(domain, menuName, location) {
  if (!location) return null;
  return wp(domain, ['menu', 'location', 'assign', menuName, location]);
}

// ---------------------------------------------------------------------------
// Block theme (Full Site Editing) navigation
//
// Block themes do not render classic `wp_menu` items — their header template
// part contains a `<!-- wp:navigation /-->` block that references a
// `wp_navigation` post type. To populate the visible navigation we either:
//   (a) update every existing wp_navigation post with our links (covers the
//       case where the theme already shipped one and the template refs it),
//   (b) create a new wp_navigation post when none exist (the Navigation
//       block falls back to the most recent published wp_navigation when
//       no explicit `ref` is set).
// ---------------------------------------------------------------------------

async function isBlockTheme(domain) {
  const r = await wpSoft(domain, ['eval', "echo wp_is_block_theme() ? '1' : '0';"]);
  return r.code === 0 && r.stdout.trim() === '1';
}

/**
 * Build the inner block-markup string for a wp_navigation post containing
 * one navigation-link per page.
 *
 *   <!-- wp:navigation-link {"label":"About Us","type":"page","id":42,
 *        "url":"/about-us/","kind":"post-type"} /-->
 */
function buildNavigationLinks(pageRecords) {
  // NB: blocks are joined with NO separator — the WP block parser doesn't
  // need whitespace between block delimiters, and embedding actual newlines
  // here causes our multi-layer shell quoting (panel → ssh → ee → bash → wp)
  // to misparse on some hosts. Keeping the whole content on one line removes
  // the failure mode entirely.
  return pageRecords.map((p) => {
    const json = JSON.stringify({
      label: p.menuTitle,
      type: 'page',
      id: p.id,
      kind: 'post-type',
      url: `/${p.slug}/`
    });
    return `<!-- wp:navigation-link ${json} /-->`;
  }).join('');
}

async function configureBlockNavigation(domain, pageRecords, menuName) {
  if (!Array.isArray(pageRecords) || pageRecords.length === 0) return null;

  const content = buildNavigationLinks(pageRecords);
  const contentB64 = Buffer.from(content, 'utf8').toString('base64');
  const titleB64   = Buffer.from(String(menuName || 'Main Menu'), 'utf8').toString('base64');

  // ─────────────────────────────────────────────────────────────────────────
  // Why this is wrapped in eval(base64_decode(...)) instead of just sent as
  // PHP code:
  //
  //   The string that reaches `wp eval` travels through:
  //     panel → ssh → host wrapper (bash -c "/usr/local/bin/ee $ARGS")
  //          → ee binary → docker exec → inner shell → wp-cli → PHP eval
  //
  //   The host wrapper's `bash -c "...$ARGS"` does parameter expansion ONCE
  //   on the substituted value. If $ARGS contains literal `$c=...` PHP
  //   variable names, bash treats them as undefined shell variables and
  //   silently expands them to empty strings — PHP then sees `=base64_decode(...)`
  //   and fails to parse.
  //
  //   By base64-encoding the inner PHP body and only emitting the outer
  //   wrapper `eval(base64_decode("..."));`, the string the shell touches
  //   contains ZERO `$` characters and ZERO single quotes. Nothing to
  //   accidentally expand, nothing to break the quoting.
  // ─────────────────────────────────────────────────────────────────────────
  const phpInner = (
    'error_reporting(E_ERROR);' + // squelch the wp_actionscheduler_actions warnings during boot
    '$c=base64_decode("' + contentB64 + '");' +
    '$t=base64_decode("' + titleB64   + '");' +
    '$existing=get_posts(["post_type"=>"wp_navigation","post_status"=>"any","posts_per_page"=>50,"orderby"=>"date","order"=>"ASC"]);' +
    '$ids=[];' +
    'if($existing){' +
      'foreach($existing as $p){' +
        'wp_update_post(["ID"=>$p->ID,"post_title"=>$t,"post_content"=>$c,"post_status"=>"publish"]);' +
        '$ids[]=$p->ID;' +
      '}' +
    '}else{' +
      '$id=wp_insert_post(["post_type"=>"wp_navigation","post_status"=>"publish","post_title"=>$t,"post_content"=>$c]);' +
      'if($id){$ids[]=$id;}' +
    '}' +
    'echo json_encode(["ids"=>$ids,"created"=>empty($existing)]);'
  );

  const phpInnerB64 = Buffer.from(phpInner, 'utf8').toString('base64');
  const phpOuter = `eval(base64_decode("${phpInnerB64}"));`;

  const r = await wp(domain, ['eval', phpOuter]);
  const out = (r.stdout || '').trim();

  // Be tolerant — there may be PHP warnings/notices before the final JSON
  // (the action-scheduler tables can still produce DB errors during boot).
  const m = out.match(/\{[\s\S]*\}\s*$/);
  if (m) {
    try { return JSON.parse(m[0]); } catch (_) { /* fall through */ }
  }
  return { ids: [], created: false, raw: out };
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

  // 6) Classic menu — always created (visible in Appearance > Menus and used
  //    by classic themes). Idempotent via delete-then-create.
  const menuName = tpl.menuName || 'Main Menu';
  await deleteMenuByName(domain, menuName);
  const menuId = await createMenu(domain, menuName);
  for (const p of pageRecords) {
    await addItemToMenu(domain, menuName, p.id, p.menuTitle);
  }

  // 7) Auto-detect theme's primary menu location (classic themes only) and
  //    assign the menu there.
  const menuLocation = await getFirstMenuLocation(domain);
  if (menuLocation) {
    await assignMenuToLocation(domain, menuName, menuLocation);
  }

  // 7b) Block theme (FSE) navigation — populate the wp_navigation post(s)
  //     so the Navigation block in the theme's header template renders our
  //     pages instead of the empty "#" placeholders.
  let blockTheme = false;
  let blockNavigation = null;
  try {
    blockTheme = await isBlockTheme(domain);
  } catch (_) { /* fallback to classic */ }
  if (blockTheme) {
    blockNavigation = await configureBlockNavigation(domain, pageRecords, menuName);
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
    menuLocation: menuLocation || null,
    isBlockTheme: blockTheme,
    blockNavigation
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
  isBlockTheme,
  configureBlockNavigation,
  flushRewrite,
  flushCache,
  getSiteUrl,
  getAdminPassword,
  configureNewSite
};
