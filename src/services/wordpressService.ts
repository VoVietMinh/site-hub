import { runEE as run, runEEOrThrow as runOrThrow } from './eeBridge';
import * as v from '../utils/validators';
import * as siteTemplate from './siteTemplate';
import type { RunResult } from './commandRunner';

function shellQuote(arg: string): string {
  const s = String(arg);
  if (/^[A-Za-z0-9_./:=,\-]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function buildWpCommand(wpArgv: string[]): string {
  return ['wp', ...wpArgv, '--allow-root'].map(shellQuote).join(' ');
}

export async function wp(domain: string, wpArgv: string[], opts: { timeoutMs?: number } = {}): Promise<RunResult> {
  v.assertDomain(domain);
  if (!Array.isArray(wpArgv) || wpArgv.length === 0) throw new Error('wpArgv must be a non-empty array');
  const command = buildWpCommand(wpArgv);
  return runOrThrow(['shell', domain, '--command=' + command], {
    category: 'wp-cli', timeoutMs: opts.timeoutMs ?? 10 * 60 * 1000,
  });
}

export async function wpSoft(domain: string, wpArgv: string[], opts: { timeoutMs?: number } = {}): Promise<RunResult> {
  v.assertDomain(domain);
  const command = buildWpCommand(wpArgv);
  return run(['shell', domain, '--command=' + command], {
    category: 'wp-cli', timeoutMs: opts.timeoutMs ?? 10 * 60 * 1000,
  });
}

async function safeOptionUpdate(domain: string, key: string, value: string): Promise<RunResult> {
  const r = await wpSoft(domain, ['option', 'update', key, value]);
  if (r.code === 0) return r;
  if (/Could not update option/i.test(r.stderr)) return r;
  const msg = (r.stderr || r.stdout || '').trim();
  throw Object.assign(new Error('wp option update ' + key + ' failed: ' + msg), { result: r });
}

export async function setSiteOptions(domain: string, opts: { title?: string; description?: string }): Promise<void> {
  if (opts.title)       await safeOptionUpdate(domain, 'blogname', opts.title);
  if (opts.description) await safeOptionUpdate(domain, 'blogdescription', opts.description);
}

export async function applyOptionMap(domain: string, options: Record<string, string | null | undefined>): Promise<void> {
  for (const k of Object.keys(options)) {
    const val = options[k];
    if (val === null || val === undefined) continue;
    await safeOptionUpdate(domain, k, String(val));
  }
}

const isHarmlessInstallNoop  = (stderr: string): boolean => /already installed|destination folder already exists/i.test(stderr ?? '');
const isHarmlessActivateNoop = (stderr: string): boolean => /already active/i.test(stderr ?? '');

export async function installTheme(domain: string, slug: string, opts: { activate?: boolean } = {}): Promise<{ installed: RunResult; activated: boolean }> {
  const activate = opts.activate !== false;
  const inst = await wpSoft(domain, ['theme', 'install', slug]);
  if (inst.code !== 0 && !isHarmlessInstallNoop(inst.stderr)) {
    throw Object.assign(new Error('theme install ' + slug + ' failed: ' + (inst.stderr || inst.stdout).trim()), { result: inst });
  }
  if (activate) {
    const act = await wpSoft(domain, ['theme', 'activate', slug]);
    if (act.code !== 0 && !isHarmlessActivateNoop(act.stderr)) {
      throw Object.assign(new Error('theme activate ' + slug + ' failed: ' + (act.stderr || act.stdout).trim()), { result: act });
    }
  }
  return { installed: inst, activated: activate };
}

export async function installPlugins(domain: string, slugs: string[], opts: { activate?: boolean } = {}): Promise<Array<{ slug: string; ok: boolean; error?: string }>> {
  const activate = opts.activate !== false;
  if (!Array.isArray(slugs) || slugs.length === 0) return [];
  const results: Array<{ slug: string; ok: boolean; error?: string }> = [];
  for (const slug of slugs) {
    const inst = await wpSoft(domain, ['plugin', 'install', slug]);
    const installOk = inst.code === 0 || isHarmlessInstallNoop(inst.stderr);
    if (!installOk) { results.push({ slug, ok: false, error: (inst.stderr || inst.stdout).trim() }); continue; }
    if (!activate)  { results.push({ slug, ok: true }); continue; }
    const act = await wpSoft(domain, ['plugin', 'activate', slug]);
    const activateOk = act.code === 0 || isHarmlessActivateNoop(act.stderr);
    results.push(activateOk ? { slug, ok: true } : { slug, ok: false, error: (act.stderr || act.stdout).trim() });
  }
  return results;
}

export async function ensureCategory(domain: string, name: string): Promise<string> {
  const r = await wpSoft(domain, ['term', 'create', 'category', name, '--porcelain']);
  return r.stdout.trim();
}

export async function findPageBySlug(domain: string, slug: string): Promise<number | null> {
  const r = await wp(domain, ['post', 'list', '--post_type=page', '--name=' + slug, '--field=ID']);
  const lines = r.stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const id = parseInt(lines[lines.length - 1]!, 10);
  return Number.isFinite(id) ? id : null;
}

export async function createOrUpdatePage(domain: string, page: { slug: string; title: string; content: string }): Promise<number> {
  const existing = await findPageBySlug(domain, page.slug);
  if (existing) {
    await wp(domain, ['post', 'update', String(existing), '--post_title=' + page.title, '--post_content=' + page.content]);
    return existing;
  }
  const r = await wp(domain, ['post', 'create', '--post_type=page', '--post_status=publish',
    '--post_title=' + page.title, '--post_name=' + page.slug, '--post_content=' + page.content, '--porcelain']);
  return parseInt(r.stdout.trim(), 10);
}

export async function deleteMenuByName(domain: string, name: string): Promise<boolean> {
  const r = await wpSoft(domain, ['menu', 'delete', name]);
  return r.code === 0;
}

export async function createMenu(domain: string, name: string): Promise<number> {
  const r = await wp(domain, ['menu', 'create', name, '--porcelain']);
  return parseInt(r.stdout.trim(), 10);
}

export async function addItemToMenu(domain: string, menuName: string, postId: number, menuTitle?: string): Promise<RunResult> {
  const args = ['menu', 'item', 'add-post', menuName, String(postId)];
  if (menuTitle) args.push('--title=' + menuTitle);
  return wp(domain, args);
}

export async function getFirstMenuLocation(domain: string): Promise<string | null> {
  try {
    const r = await wp(domain, ['menu', 'location', 'list', '--format=csv']);
    const lines = r.stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;
    const firstCol = (lines[1]!.split(',')[0] ?? '').replace(/^"|"$/g, '').trim();
    return firstCol || null;
  } catch { return null; }
}

export async function assignMenuToLocation(domain: string, menuName: string, location: string | null): Promise<RunResult | null> {
  if (!location) return null;
  return wp(domain, ['menu', 'location', 'assign', menuName, location]);
}

export async function flushRewrite(domain: string): Promise<RunResult> {
  return wp(domain, ['rewrite', 'flush', '--hard']);
}
export async function flushCache(domain: string): Promise<RunResult> {
  return wp(domain, ['cache', 'flush']);
}

interface ConfigureNewSiteResult {
  theme: string;
  plugins: Array<{ slug: string; ok: boolean; error?: string }>;
  pages: Array<{ id: number; slug: string; menuTitle: string }>;
  menuName: string;
  menuId: number | null;
  menuLocation: string | null;
  warnings: string[];
}

export async function configureNewSite(domain: string, opts: { title?: string; description?: string; category?: string } = {}): Promise<ConfigureNewSiteResult> {
  const tpl         = siteTemplate.load();
  const websiteName = opts.title       || domain;
  const description = opts.description || '';
  const vars        = { domain, websiteName, description };
  const warnings:   string[] = [];

  await setSiteOptions(domain, { title: websiteName, description });
  await applyOptionMap(domain, tpl.options ?? {});
  await installTheme(domain, tpl.theme, { activate: true });
  const plugins = await installPlugins(domain, tpl.plugins ?? [], { activate: true });
  if (opts.category) await ensureCategory(domain, opts.category);

  const pageRecords: Array<{ id: number; slug: string; menuTitle: string }> = [];
  for (const page of (tpl.pages ?? [])) {
    const id = await createOrUpdatePage(domain, {
      slug:    page.slug,
      title:   siteTemplate.applyTemplate(page.title, vars),
      content: siteTemplate.applyTemplate(page.content, vars),
    });
    if (Number.isFinite(id)) {
      pageRecords.push({ id, slug: page.slug, menuTitle: siteTemplate.applyTemplate(page.menuTitle || page.title, vars) });
    }
  }

  const menuName = tpl.menuName || 'Main Menu';
  let menuId: number | null = null;
  let menuLocation: string | null = null;

  try {
    await deleteMenuByName(domain, menuName);
    menuId = await createMenu(domain, menuName);
    for (const p of pageRecords) await addItemToMenu(domain, menuName, p.id, p.menuTitle);
    menuLocation = await getFirstMenuLocation(domain);
    if (menuLocation) {
      await assignMenuToLocation(domain, menuName, menuLocation);
    } else {
      warnings.push('No menu location found in theme -- menu created but not assigned.');
    }
  } catch (menuErr) {
    warnings.push('Menu setup skipped: ' + (menuErr as Error).message);
  }

  await flushCache(domain).catch(() => {});
  await flushRewrite(domain);

  return { theme: tpl.theme, plugins, pages: pageRecords, menuName, menuId, menuLocation, warnings };
}
